-- SignSphere backend, part 2: synced signs, admins and verification, feedback, the cloud
-- sign pack, and live updates.
--
-- Apply AFTER 0001_signsphere.sql: Supabase dashboard → SQL editor → paste → Run.
-- Safe to run more than once. Verified by supabase/tests/rls.test.mjs.

-- ─────────────────────────────────────────────────────────────── admins

-- SignSphere staff. Nobody can add themselves: the first admin is added from the SQL
-- editor (see README), after that admins are managed the same way.
create table if not exists public.admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

alter table public.admins enable row level security;

drop policy if exists "admins: see own row" on public.admins;
create policy "admins: see own row" on public.admins
  for select to authenticated using (user_id = auth.uid());

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant select on public.admins to authenticated;
revoke all on public.admins from anon;

-- ──────────────────────────────────────────────────── account verification

alter table public.accounts add column if not exists verification_note text check (char_length(verification_note) <= 500);
alter table public.accounts add column if not exists verified_at timestamptz;
alter table public.accounts add column if not exists verified_by uuid references auth.users (id) on delete set null;

-- Admins can see hospitals and organisations (to check their registration), never
-- individuals' personal accounts.
drop policy if exists "accounts: admins read organisations" on public.accounts;
create policy "accounts: admins read organisations" on public.accounts
  for select to authenticated using (public.is_admin() and type in ('hospital', 'organisation'));

drop policy if exists "accounts: admins review organisations" on public.accounts;
create policy "accounts: admins review organisations" on public.accounts
  for update to authenticated
  using (public.is_admin() and type in ('hospital', 'organisation'))
  with check (public.is_admin() and type in ('hospital', 'organisation'));

-- Replaces the 0001 guard. Rules for `verification`:
--   * staff (service_role) and admins may set any status;
--   * an owner may only ask for review: 'unverified' → 'pending' (hospital / organisation);
--   * changing the registration number of a reviewed account sends it back to 'unverified'.
-- An admin editing someone else's account can change only the review fields.
create or replace function public.accounts_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  staff boolean := coalesce(auth.role(), '') = 'service_role' or public.is_admin();
  owner boolean := old.user_id = auth.uid();
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.accounts where user_id = new.user_id) >= 10 then
      raise exception 'too many accounts for one login (max 10)';
    end if;
    new.verification := 'unverified';
    new.verification_note := null;
    new.verified_at := null;
    new.verified_by := null;
    return new;
  end if;

  if new.user_id <> old.user_id then
    raise exception 'accounts cannot be moved to another login';
  end if;

  if staff and not owner then
    -- Reviewing someone else's account: only the review fields may change.
    new.type := old.type;
    new.display_name := old.display_name;
    new.details := old.details;
  end if;

  if new.verification is distinct from old.verification then
    if staff then
      new.verified_at := case when new.verification = 'verified' then now() else null end;
      new.verified_by := case when new.verification = 'verified' then auth.uid() else null end;
    elsif owner and old.verification = 'unverified' and new.verification = 'pending'
          and old.type in ('hospital', 'organisation') then
      new.verification_note := null;
    else
      new.verification := old.verification;
    end if;
  end if;

  if not staff then
    new.verification_note := old.verification_note;
    new.verified_at := old.verified_at;
    new.verified_by := old.verified_by;
    -- New registration details need a new review.
    if old.verification <> 'unverified'
       and (new.details ->> 'registrationNumber') is distinct from (old.details ->> 'registrationNumber') then
      new.verification := 'unverified';
      new.verified_at := null;
      new.verified_by := null;
    end if;
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists accounts_guard on public.accounts;
create trigger accounts_guard before insert or update on public.accounts
  for each row execute function public.accounts_guard();

-- ───────────────────────────────────────────────────────────────── signs

-- Signs a user recorded on the Record screen, so they work on every device they sign in
-- on: `vector` feeds recognition (Sign → Text), `motion` drives the 3D avatar.
create table if not exists public.signs (
  id               uuid primary key,  -- client-generated: offline retries never duplicate
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id       uuid references public.accounts (id) on delete set null,
  gloss            text not null check (char_length(gloss) between 1 and 64 and gloss = upper(gloss)),
  feature_version  int not null check (feature_version between 1 and 1000),
  source_frames    int not null check (source_frames between 1 and 2000),
  vector           real[] not null check (cardinality(vector) between 1 and 16384),
  motion           text check (char_length(motion) <= 400000),
  meta             jsonb not null default '{}'::jsonb check (jsonb_typeof(meta) = 'object' and pg_column_size(meta) < 4096),
  created_at       timestamptz not null default now()
);

create index if not exists signs_user_created_idx on public.signs (user_id, created_at desc);

alter table public.signs enable row level security;

drop policy if exists "signs: read own" on public.signs;
create policy "signs: read own" on public.signs
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "signs: add own" on public.signs;
create policy "signs: add own" on public.signs
  for insert to authenticated with check (
    user_id = auth.uid()
    and (account_id is null or exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid()))
  );

drop policy if exists "signs: delete own" on public.signs;
create policy "signs: delete own" on public.signs
  for delete to authenticated using (user_id = auth.uid());

create or replace function public.signs_limit() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.signs where user_id = new.user_id) >= 3000 then
    raise exception 'sign limit reached (3000 recordings per login)';
  end if;
  return new;
end $$;

drop trigger if exists signs_limit on public.signs;
create trigger signs_limit before insert on public.signs
  for each row execute function public.signs_limit();

grant select, insert, delete on public.signs to authenticated;
revoke all on public.signs from anon;

-- ────────────────────────────────────────────────────────────── feedback

-- "This sign looks wrong", "please add a sign", bug reports. Reviewed by admins.
create table if not exists public.feedback (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id   uuid references public.accounts (id) on delete set null,
  kind         text not null check (kind in ('wrong-sign', 'missing-sign', 'recognition', 'bug', 'idea', 'other')),
  gloss        text check (char_length(gloss) <= 64),
  message      text not null check (char_length(message) between 3 and 2000),
  page         text check (char_length(page) <= 200),
  status       text not null default 'open' check (status in ('open', 'resolved')),
  admin_note   text check (char_length(admin_note) <= 1000),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

create index if not exists feedback_status_created_idx on public.feedback (status, created_at desc);

alter table public.feedback enable row level security;

drop policy if exists "feedback: send" on public.feedback;
create policy "feedback: send" on public.feedback
  for insert to authenticated with check (
    user_id = auth.uid() and status = 'open' and admin_note is null and resolved_at is null
    and (account_id is null or exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid()))
  );

drop policy if exists "feedback: read own or admin" on public.feedback;
create policy "feedback: read own or admin" on public.feedback
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists "feedback: admins resolve" on public.feedback;
create policy "feedback: admins resolve" on public.feedback
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "feedback: delete own" on public.feedback;
create policy "feedback: delete own" on public.feedback
  for delete to authenticated using (user_id = auth.uid());

-- Admins may only change the review fields of a report.
create or replace function public.feedback_guard() returns trigger
language plpgsql as $$
begin
  new.user_id := old.user_id;
  new.account_id := old.account_id;
  new.kind := old.kind;
  new.gloss := old.gloss;
  new.message := old.message;
  new.page := old.page;
  new.created_at := old.created_at;
  new.resolved_at := case when new.status = 'resolved' then coalesce(old.resolved_at, now()) else null end;
  return new;
end $$;

drop trigger if exists feedback_guard on public.feedback;
create trigger feedback_guard before update on public.feedback
  for each row execute function public.feedback_guard();

grant select, insert, update, delete on public.feedback to authenticated;
revoke all on public.feedback from anon;

-- ────────────────────────────────────────────────────── admin dashboard

create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then
    raise exception 'admins only';
  end if;
  return jsonb_build_object(
    'logins', (select count(*) from auth.users),
    'accounts', (select jsonb_object_agg(type, n) from (select type, count(*) as n from public.accounts group by type) t),
    'pendingReviews', (select count(*) from public.accounts where verification = 'pending'),
    'verified', (select count(*) from public.accounts where verification = 'verified'),
    'historyLast7Days', (select count(*) from public.history where created_at > now() - interval '7 days'),
    'signsRecorded', (select count(*) from public.signs),
    'openFeedback', (select count(*) from public.feedback where status = 'open')
  );
end $$;

revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

-- ──────────────────────────────────────────────── cloud sign pack (storage)

-- Public bucket holding the ISL sign pack (isl-include.json). Every copy of the app loads
-- it, so the dataset can be updated without releasing a new version. Only admins upload.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('sign-packs', 'sign-packs', true)
    on conflict (id) do update set public = true;

    execute 'drop policy if exists "sign-packs: admins upload" on storage.objects';
    execute $p$create policy "sign-packs: admins upload" on storage.objects
      for insert to authenticated with check (bucket_id = 'sign-packs' and public.is_admin())$p$;
    execute 'drop policy if exists "sign-packs: admins replace" on storage.objects';
    execute $p$create policy "sign-packs: admins replace" on storage.objects
      for update to authenticated using (bucket_id = 'sign-packs' and public.is_admin())$p$;
    execute 'drop policy if exists "sign-packs: admins delete" on storage.objects';
    execute $p$create policy "sign-packs: admins delete" on storage.objects
      for delete to authenticated using (bucket_id = 'sign-packs' and public.is_admin())$p$;
  end if;
end $$;

-- ───────────────────────────────────────────────────────────── realtime

-- History and signs update live on a user's other devices (still limited by RLS).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'history') then
      execute 'alter publication supabase_realtime add table public.history';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'signs') then
      execute 'alter publication supabase_realtime add table public.signs';
    end if;
  end if;
end $$;
