-- SignSphere backend, part 3: admin tools.
--   * manage the SignSphere team (add / remove admins by email)
--   * block a login that misuses the app (it can still read and delete its own data)
--   * announcements shown to every user
--   * the vocabulary (English word → ISL gloss), editable without a new release, with a
--     record of which fluent signer reviewed each entry
--   * usage statistics (counts only — never anyone's text or recordings)
--
-- Apply AFTER 0002_backend.sql: Supabase dashboard → SQL editor → paste → Run.
-- Safe to run more than once. Verified by supabase/tests/rls.test.mjs.
--
-- Every admin action is a function that checks public.is_admin() itself, so the rules hold
-- whichever app (or tool) calls them.

-- ─────────────────────────────────────────────────────────────── the team

-- Internal: the team list, without the admin check (callers check). Not callable by users.
create or replace function public.team_list() returns jsonb
language sql stable security definer set search_path = public, auth as $$
  select coalesce(jsonb_agg(jsonb_build_object('userId', a.user_id, 'email', u.email, 'since', a.created_at) order by a.created_at), '[]'::jsonb)
  from public.admins a join auth.users u on u.id = a.user_id;
$$;
revoke all on function public.team_list() from public, anon, authenticated;

create or replace function public.admin_list_admins() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return public.team_list();
end $$;

create or replace function public.admin_add_admin(target_email text) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare
  target uuid;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  select id into target from auth.users where lower(email) = lower(trim(target_email));
  if target is null then
    raise exception 'no login with that email — ask them to sign up first';
  end if;
  insert into public.admins (user_id) values (target) on conflict do nothing;
  delete from public.blocked_users where user_id = target;
  return public.admin_list_admins();
end $$;

create or replace function public.admin_remove_admin(target uuid) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if (select count(*) from public.admins) <= 1 and exists (select 1 from public.admins where user_id = target) then
    raise exception 'cannot remove the last admin';
  end if;
  delete from public.admins where user_id = target;
  return public.team_list();
end $$;

-- ─────────────────────────────────────────────────────────────── blocking

create table if not exists public.blocked_users (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  reason      text check (char_length(reason) <= 500),
  blocked_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.blocked_users enable row level security;
revoke all on public.blocked_users from anon, authenticated;

create or replace function public.is_blocked() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocked_users where user_id = auth.uid());
$$;

-- What the app asks after sign-in: is this login suspended, and why.
create or replace function public.my_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'blocked', b.user_id is not null,
    'reason', b.reason
  ) from (select 1) one left join public.blocked_users b on b.user_id = auth.uid();
$$;

revoke all on function public.is_blocked() from public, anon;
grant execute on function public.is_blocked() to authenticated;
revoke all on function public.my_status() from public, anon;
grant execute on function public.my_status() to authenticated;

-- A blocked login cannot add or change anything. It can still read and delete its own data.
do $$
declare
  t text;
begin
  foreach t in array array['accounts', 'history', 'signs', 'feedback'] loop
    execute format('drop policy if exists "blocked: no new data" on public.%I', t);
    execute format('create policy "blocked: no new data" on public.%I as restrictive for insert to authenticated with check (not public.is_blocked())', t);
    execute format('drop policy if exists "blocked: no changes" on public.%I', t);
    execute format('create policy "blocked: no changes" on public.%I as restrictive for update to authenticated using (not public.is_blocked()) with check (not public.is_blocked())', t);
  end loop;
end $$;

-- Logins, for the admin's Users list: email, dates and how many accounts — never the
-- contents of anyone's accounts, history or recordings.
create or replace function public.admin_list_users(search text default '') returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return coalesce((
    select jsonb_agg(item order by item->>'joined' desc nulls last)
    from (
      select jsonb_build_object(
        'userId', u.id,
        'email', u.email,
        'joined', to_jsonb(u)->>'created_at',
        'lastSignIn', coalesce(to_jsonb(u)->>'last_sign_in_at', to_jsonb(u)->>'last_sign_in'),
        'accounts', (select count(*) from public.accounts a where a.user_id = u.id),
        'admin', exists (select 1 from public.admins x where x.user_id = u.id),
        'blocked', b.user_id is not null,
        'blockedReason', b.reason
      ) as item
      from auth.users u
      left join public.blocked_users b on b.user_id = u.id
      where coalesce(search, '') = '' or u.email ilike '%' || replace(replace(search, '%', ''), '_', '') || '%'
      limit 200
    ) list
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_set_blocked(target uuid, blocked boolean, reason text default null) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if blocked then
    if target = auth.uid() then raise exception 'you cannot block yourself'; end if;
    if exists (select 1 from public.admins where user_id = target) then
      raise exception 'remove them from the team before blocking them';
    end if;
    insert into public.blocked_users (user_id, reason, blocked_by)
    values (target, nullif(trim(reason), ''), auth.uid())
    on conflict (user_id) do update set reason = excluded.reason, blocked_by = excluded.blocked_by, created_at = now();
  else
    delete from public.blocked_users where user_id = target;
  end if;
end $$;

-- ────────────────────────────────────────────────────────────── announcements

create table if not exists public.announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 120),
  body        text not null default '' check (char_length(body) <= 1000),
  active      boolean not null default true,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.announcements enable row level security;
revoke all on public.announcements from anon, authenticated;

-- Everyone, signed in or not, sees the active announcements (newest first).
create or replace function public.active_announcements() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'body', body, 'createdAt', created_at) order by created_at desc), '[]'::jsonb)
  from (select * from public.announcements where active order by created_at desc limit 3) recent;
$$;

create or replace function public.admin_list_announcements() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'body', body, 'active', active, 'createdAt', created_at) order by created_at desc)
    from public.announcements
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_post_announcement(title text, body text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  insert into public.announcements (title, body, created_by) values (trim(title), coalesce(trim(body), ''), auth.uid());
  return public.admin_list_announcements();
end $$;

create or replace function public.admin_set_announcement(id uuid, active boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  update public.announcements a set active = admin_set_announcement.active where a.id = admin_set_announcement.id;
  return public.admin_list_announcements();
end $$;

create or replace function public.admin_delete_announcement(id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  delete from public.announcements a where a.id = admin_delete_announcement.id;
  return public.admin_list_announcements();
end $$;

-- ─────────────────────────────────────────────────────────────── vocabulary

-- Added or corrected words. The app merges these over the built-in vocabulary
-- (packages/gloss/lexicon/isl-core.json): same gloss = replaced, new gloss = added.
create table if not exists public.vocabulary (
  gloss        text primary key check (gloss ~ '^[A-Z0-9][A-Z0-9_-]{0,63}$'),
  english      text[] not null check (cardinality(english) between 1 and 30),
  pos          text not null check (pos in ('noun', 'verb', 'adj', 'adv', 'pron', 'num', 'wh', 'neg', 'time', 'quant', 'other')),
  category     text check (char_length(category) <= 40),
  notes        text check (char_length(notes) <= 500),
  two_handed   boolean not null default false,
  -- A fluent ISL signer confirmed this entry; reviewed_by names them.
  reviewed     boolean not null default false,
  reviewed_by  text check (char_length(reviewed_by) <= 120),
  hidden       boolean not null default false,
  updated_by   uuid references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now(),
  check (not reviewed or char_length(trim(coalesce(reviewed_by, ''))) > 0)
);

alter table public.vocabulary enable row level security;
revoke all on public.vocabulary from anon, authenticated;

create or replace function public.vocabulary_entries() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'gloss', gloss, 'english', english, 'pos', pos, 'category', category, 'notes', notes,
    'twoHanded', two_handed, 'reviewed', reviewed, 'reviewedBy', reviewed_by, 'hidden', hidden, 'updatedAt', updated_at
  ) order by gloss), '[]'::jsonb) from public.vocabulary;
$$;

create or replace function public.admin_save_word(
  gloss text, english text[], pos text, category text default null, notes text default null,
  two_handed boolean default false, reviewed boolean default false, reviewed_by text default null, hidden boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  words text[];
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  select array_agg(distinct lower(trim(w))) into words from unnest(english) w where trim(w) <> '';
  insert into public.vocabulary as v (gloss, english, pos, category, notes, two_handed, reviewed, reviewed_by, hidden, updated_by, updated_at)
  values (upper(trim(admin_save_word.gloss)), coalesce(words, '{}'), admin_save_word.pos, nullif(trim(admin_save_word.category), ''),
          nullif(trim(admin_save_word.notes), ''), coalesce(admin_save_word.two_handed, false), coalesce(admin_save_word.reviewed, false),
          nullif(trim(admin_save_word.reviewed_by), ''), coalesce(admin_save_word.hidden, false), auth.uid(), now())
  on conflict on constraint vocabulary_pkey do update set
    english = excluded.english, pos = excluded.pos, category = excluded.category, notes = excluded.notes,
    two_handed = excluded.two_handed, reviewed = excluded.reviewed, reviewed_by = excluded.reviewed_by,
    hidden = excluded.hidden, updated_by = excluded.updated_by, updated_at = now();
  return public.vocabulary_entries();
end $$;

create or replace function public.admin_delete_word(gloss text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  delete from public.vocabulary v where v.gloss = upper(trim(admin_delete_word.gloss));
  return public.vocabulary_entries();
end $$;

-- ─────────────────────────────────────────────────────────────── statistics

-- Counts only. No user ids, no history text, no recordings. "Missing signs" are the glosses
-- users asked for in reports, so the team knows what to add next.
create or replace function public.admin_stats(days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare
  span int := least(greatest(coalesce(days, 30), 7), 180);
  since timestamptz := date_trunc('day', now()) - make_interval(days => span - 1);
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return jsonb_build_object(
    'days', span,
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'translations', coalesce(h.n, 0), 'signups', coalesce(s.n, 0), 'reports', coalesce(f.n, 0)) order by d), '[]'::jsonb)
      from generate_series(since, date_trunc('day', now()), interval '1 day') d
      left join (select date_trunc('day', created_at) as day, count(*) as n from public.history where created_at >= since group by 1) h on h.day = d
      left join (select date_trunc('day', (to_jsonb(u)->>'created_at')::timestamptz) as day, count(*) as n from auth.users u
                 where (to_jsonb(u)->>'created_at') is not null and (to_jsonb(u)->>'created_at')::timestamptz >= since group by 1) s on s.day = d
      left join (select date_trunc('day', created_at) as day, count(*) as n from public.feedback where created_at >= since group by 1) f on f.day = d
    ),
    'byKind', (
      select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb)
      from (select kind, count(*) as n from public.history where created_at >= since group by kind) k
    ),
    'topRecorded', (
      select coalesce(jsonb_agg(jsonb_build_object('gloss', gloss, 'count', n) order by n desc, gloss), '[]'::jsonb)
      from (select gloss, count(*) as n from public.signs group by gloss order by n desc, gloss limit 15) r
    ),
    'missingRequested', (
      select coalesce(jsonb_agg(jsonb_build_object('gloss', g, 'count', n) order by n desc, g), '[]'::jsonb)
      from (select upper(trim(gloss)) as g, count(*) as n from public.feedback
            where kind in ('missing-sign', 'wrong-sign', 'recognition') and coalesce(trim(gloss), '') <> ''
            group by 1 order by n desc, 1 limit 15) m
    ),
    'reportsByKind', (
      select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb)
      from (select kind, count(*) as n from public.feedback group by kind) r
    ),
    'blocked', (select count(*) from public.blocked_users),
    'admins', (select count(*) from public.admins)
  );
end $$;

-- ─────────────────────────────────────────────────────────────── who may call what

do $$
declare
  f text;
begin
  foreach f in array array[
    'admin_list_admins()', 'admin_add_admin(text)', 'admin_remove_admin(uuid)',
    'admin_list_users(text)', 'admin_set_blocked(uuid, boolean, text)',
    'admin_list_announcements()', 'admin_post_announcement(text, text)', 'admin_set_announcement(uuid, boolean)', 'admin_delete_announcement(uuid)',
    'admin_save_word(text, text[], text, text, text, boolean, boolean, text, boolean)', 'admin_delete_word(text)',
    'admin_stats(int)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

revoke all on function public.active_announcements() from public;
grant execute on function public.active_announcements() to anon, authenticated;
revoke all on function public.vocabulary_entries() from public;
grant execute on function public.vocabulary_entries() to anon, authenticated;
