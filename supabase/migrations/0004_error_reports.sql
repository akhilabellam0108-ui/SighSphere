-- SignSphere backend, part 4: error reports.
--
-- When the app breaks on someone's phone it sends a short report — the error message, where in
-- the code, which screen and which app version. Never the person's words, recordings, email or
-- login id. The same error is grouped into one row with a count, so a crash that hits everyone
-- is one line in Admin → Errors, not thousands.
--
-- Apply AFTER 0003_admin_tools.sql. Safe to run more than once.

create table if not exists public.error_reports (
  id           bigint generated always as identity primary key,
  fingerprint  text not null unique,
  message      text not null check (char_length(message) <= 500),
  stack        text check (char_length(stack) <= 4000),
  page         text check (char_length(page) <= 200),
  app_version  text check (char_length(app_version) <= 60),
  platform     text check (char_length(platform) <= 80),
  count        int not null default 1,
  signed_in    boolean not null default false,
  resolved     boolean not null default false,
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now()
);

alter table public.error_reports enable row level security;
revoke all on public.error_reports from anon, authenticated;

-- Anyone (signed in or not) can report; the table is capped so it cannot be flooded.
create or replace function public.report_error(message text, stack text default null, page text default null,
                                               app_version text default null, platform text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  msg text := left(coalesce(nullif(trim(message), ''), 'Unknown error'), 500);
  where_in text := left(coalesce(stack, ''), 4000);
  -- Same message from the same place in the code = the same problem.
  fp text := md5(msg || '|' || split_part(regexp_replace(where_in, '\?[^):\s]*', '', 'g'), E'\n', 2));
begin
  if exists (select 1 from public.error_reports where fingerprint = fp) then
    update public.error_reports set
      count = least(count + 1, 2000000000), last_seen = now(), resolved = false,
      page = left(report_error.page, 200), app_version = left(report_error.app_version, 60), platform = left(report_error.platform, 80)
    where fingerprint = fp;
  elsif (select count(*) from public.error_reports) < 2000 then
    insert into public.error_reports (fingerprint, message, stack, page, app_version, platform, signed_in)
    values (fp, msg, nullif(where_in, ''), left(report_error.page, 200), left(report_error.app_version, 60),
            left(report_error.platform, 80), auth.uid() is not null)
    on conflict (fingerprint) do update set count = public.error_reports.count + 1, last_seen = now(), resolved = false;
  end if;
end $$;

create or replace function public.admin_list_errors(include_resolved boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id, 'message', message, 'stack', stack, 'page', page, 'appVersion', app_version, 'platform', platform,
      'count', count, 'signedIn', signed_in, 'resolved', resolved, 'firstSeen', first_seen, 'lastSeen', last_seen
    ) order by resolved, last_seen desc)
    from (select * from public.error_reports where include_resolved or not resolved order by last_seen desc limit 300) e
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_resolve_error(id bigint, resolved boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  update public.error_reports e set resolved = admin_resolve_error.resolved where e.id = admin_resolve_error.id;
end $$;

create or replace function public.admin_delete_resolved_errors() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  delete from public.error_reports where resolved;
end $$;

-- Open errors count towards the admin's alert badge.
create or replace function public.admin_open_errors() returns int
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return (select count(*) from public.error_reports where not resolved);
end $$;

revoke all on function public.report_error(text, text, text, text, text) from public;
grant execute on function public.report_error(text, text, text, text, text) to anon, authenticated;
do $$
declare
  f text;
begin
  foreach f in array array['admin_list_errors(boolean)', 'admin_resolve_error(bigint, boolean)', 'admin_delete_resolved_errors()', 'admin_open_errors()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
