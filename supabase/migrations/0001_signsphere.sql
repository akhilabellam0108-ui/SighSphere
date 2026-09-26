-- SignSphere database schema (Supabase / Postgres).
--
-- Apply: Supabase dashboard → SQL editor → paste this file → Run.
-- (or `supabase db push` with the Supabase CLI)
--
-- Security model: every row belongs to one login (auth.users). Row-level security means a
-- login can only ever read or change its own accounts and history — enforced by the
-- database, not by the app. Verified by supabase/tests/rls.test.mjs.

-- ─────────────────────────────────────────────────────────────── accounts

create table if not exists public.accounts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type          text not null check (type in ('individual', 'hospital', 'organisation')),
  display_name  text not null check (char_length(display_name) between 1 and 120),
  details       jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object' and pg_column_size(details) < 16384),
  -- Set by SignSphere staff after checking a hospital's / organisation's registration.
  verification  text not null default 'unverified' check (verification in ('unverified', 'pending', 'verified')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists accounts_user_id_idx on public.accounts (user_id);

alter table public.accounts enable row level security;

drop policy if exists "accounts: read own" on public.accounts;
create policy "accounts: read own" on public.accounts
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "accounts: create own" on public.accounts;
create policy "accounts: create own" on public.accounts
  for insert to authenticated with check (user_id = auth.uid() and verification = 'unverified');

drop policy if exists "accounts: update own" on public.accounts;
create policy "accounts: update own" on public.accounts
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "accounts: delete own" on public.accounts;
create policy "accounts: delete own" on public.accounts
  for delete to authenticated using (user_id = auth.uid());

-- Users cannot verify themselves or move an account to another login; staff (service_role)
-- can change verification. Also keeps updated_at honest.
create or replace function public.accounts_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.user_id <> old.user_id then
      raise exception 'accounts cannot be moved to another login';
    end if;
    if new.verification <> old.verification and coalesce(auth.role(), '') <> 'service_role' then
      new.verification := old.verification;
    end if;
    new.updated_at := now();
  end if;
  if tg_op = 'INSERT' then
    if (select count(*) from public.accounts where user_id = new.user_id) >= 10 then
      raise exception 'too many accounts for one login (max 10)';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists accounts_guard on public.accounts;
create trigger accounts_guard before insert or update on public.accounts
  for each row execute function public.accounts_guard();

-- ──────────────────────────────────────────────────────────────── history

create table if not exists public.history (
  -- Client-generated id: retried uploads from the offline queue can never duplicate.
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id  uuid not null references public.accounts (id) on delete cascade,
  kind        text not null check (kind in ('text-to-sign', 'voice-to-sign', 'sign-to-text', 'sign-to-voice')),
  input       text not null check (char_length(input) <= 5000),
  output      text not null check (char_length(output) <= 5000),
  created_at  timestamptz not null default now()
);

create index if not exists history_account_created_idx on public.history (account_id, created_at desc);

alter table public.history enable row level security;

drop policy if exists "history: read own" on public.history;
create policy "history: read own" on public.history
  for select to authenticated using (user_id = auth.uid());

-- Insert only into an account this login owns.
drop policy if exists "history: add to own account" on public.history;
create policy "history: add to own account" on public.history
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid())
  );

-- The offline queue re-sends edited entries (upsert), so allow updating own rows in own accounts.
drop policy if exists "history: update own" on public.history;
create policy "history: update own" on public.history
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid())
  );

drop policy if exists "history: delete own" on public.history;
create policy "history: delete own" on public.history
  for delete to authenticated using (user_id = auth.uid());

-- ──────────────────────────────────────────────────── delete my login

-- Lets a signed-in user permanently delete their own login. Accounts and history go with it
-- (on delete cascade). security definer so it can touch auth.users, but it can only ever
-- delete the caller.
create or replace function public.delete_my_user() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.delete_my_user() from public, anon;
grant execute on function public.delete_my_user() to authenticated;

grant select, insert, update, delete on public.accounts to authenticated;
grant select, insert, update, delete on public.history to authenticated;
revoke all on public.accounts from anon;
revoke all on public.history from anon;
