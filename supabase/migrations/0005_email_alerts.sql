-- SignSphere backend, part 5: email alerts for the team.
--
-- Emails the team when a hospital/organisation asks to be verified, when someone sends a
-- report, and when a new kind of error appears. Sent by the database itself through Supabase's
-- pg_net extension and Resend (https://resend.com, free tier). Without pg_net (e.g. the
-- built-in server) nothing is sent and nothing breaks.
--
-- The Resend key is write-only: admins can set or replace it, nobody can read it back.
-- At most 30 emails per hour, so a flood of reports cannot become a flood of email.
--
-- Apply AFTER 0004_error_reports.sql. Safe to run more than once.

do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net not available here — email alerts are switched off';
end $$;

create table if not exists public.alert_settings (
  id          int primary key default 1 check (id = 1),
  enabled     boolean not null default false,
  resend_key  text check (char_length(resend_key) <= 200),
  from_email  text check (char_length(from_email) <= 200),
  to_emails   text check (char_length(to_emails) <= 1000),
  updated_at  timestamptz not null default now()
);
alter table public.alert_settings enable row level security;
revoke all on public.alert_settings from anon, authenticated;

create table if not exists public.alert_log (
  id       bigint generated always as identity primary key,
  subject  text not null,
  sent     boolean not null,
  note     text,
  at       timestamptz not null default now()
);
alter table public.alert_log enable row level security;
revoke all on public.alert_log from anon, authenticated;

-- Never returns the key itself.
create or replace function public.admin_get_alerts() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s public.alert_settings;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  select * into s from public.alert_settings where id = 1;
  return jsonb_build_object(
    'enabled', coalesce(s.enabled, false),
    'hasKey', coalesce(char_length(s.resend_key) > 0, false),
    'fromEmail', s.from_email,
    'toEmails', s.to_emails,
    'available', to_regproc('net.http_post') is not null,
    'recent', coalesce((select jsonb_agg(jsonb_build_object('subject', subject, 'sent', sent, 'note', note, 'at', at) order by at desc)
                        from (select * from public.alert_log order by at desc limit 10) l), '[]'::jsonb)
  );
end $$;

-- resend_key null or '' keeps the saved key.
create or replace function public.admin_set_alerts(enabled boolean, resend_key text default null, from_email text default null, to_emails text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  insert into public.alert_settings as a (id, enabled, resend_key, from_email, to_emails, updated_at)
  values (1, coalesce(admin_set_alerts.enabled, false), nullif(trim(admin_set_alerts.resend_key), ''),
          nullif(trim(admin_set_alerts.from_email), ''), nullif(trim(admin_set_alerts.to_emails), ''), now())
  on conflict (id) do update set
    enabled = excluded.enabled,
    resend_key = coalesce(excluded.resend_key, a.resend_key),
    from_email = excluded.from_email,
    to_emails = excluded.to_emails,
    updated_at = now();
  return public.admin_get_alerts();
end $$;

-- Internal: queue one email (pg_net sends it in the background). Never raises.
create or replace function public.send_alert(subject text, body text) returns void
language plpgsql security definer set search_path = public as $$
declare
  s public.alert_settings;
  recipients text[];
begin
  select * into s from public.alert_settings where id = 1;
  if s is null or not s.enabled or coalesce(s.resend_key, '') = '' or coalesce(s.to_emails, '') = '' then
    return;
  end if;
  if (select count(*) from public.alert_log where sent and at > now() - interval '1 hour') >= 30 then
    insert into public.alert_log (subject, sent, note) values (left(subject, 200), false, 'hourly limit reached');
    return;
  end if;
  if to_regproc('net.http_post') is null then
    insert into public.alert_log (subject, sent, note) values (left(subject, 200), false, 'pg_net not available');
    return;
  end if;
  select array_agg(trim(e)) into recipients from unnest(string_to_array(s.to_emails, ',')) e where trim(e) <> '';
  execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    using 'https://api.resend.com/emails',
          jsonb_build_object('from', coalesce(s.from_email, 'SignSphere <onboarding@resend.dev>'), 'to', to_jsonb(recipients),
                             'subject', left('SignSphere: ' || subject, 200), 'text', left(body, 4000)),
          jsonb_build_object('Authorization', 'Bearer ' || s.resend_key, 'Content-Type', 'application/json');
  insert into public.alert_log (subject, sent) values (left(subject, 200), true);
exception when others then
  begin
    insert into public.alert_log (subject, sent, note) values (left(subject, 200), false, left(sqlerrm, 300));
  exception when others then null;
  end;
end $$;
revoke all on function public.send_alert(text, text) from public, anon, authenticated;

create or replace function public.admin_test_alert() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  perform public.send_alert('test email', 'Email alerts are working. You will get an email when a hospital or organisation asks to be verified, when someone sends a report, and when a new kind of error appears.');
  return public.admin_get_alerts();
end $$;

-- ── what triggers an email

create or replace function public.alert_on_verification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.verification = 'pending' and old.verification is distinct from 'pending' then
    perform public.send_alert(
      format('%s waiting for verification', new.display_name),
      format('%s (%s) asked to be verified. Review it in SignSphere: Admin → Verification.', new.display_name, new.type));
  end if;
  return new;
end $$;
drop trigger if exists alert_on_verification on public.accounts;
create trigger alert_on_verification after update of verification on public.accounts
  for each row execute function public.alert_on_verification();

create or replace function public.alert_on_feedback() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.send_alert(
    format('new report — %s%s', new.kind, coalesce(' · ' || new.gloss, '')),
    format('Someone sent a report (%s%s):%s%s%sAnswer it in SignSphere: Admin → Reports.',
           new.kind, coalesce(', sign ' || new.gloss, ''), E'\n\n', left(new.message, 1000), E'\n\n'));
  return new;
end $$;
drop trigger if exists alert_on_feedback on public.feedback;
create trigger alert_on_feedback after insert on public.feedback
  for each row execute function public.alert_on_feedback();

create or replace function public.alert_on_error() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.send_alert(
    'new error in the app',
    format('A new kind of error was reported:%s%s%sScreen: %s · %s · version %s%sSee SignSphere: Admin → Errors.',
           E'\n\n', new.message, E'\n\n', coalesce(new.page, '—'), coalesce(new.platform, '—'), coalesce(new.app_version, '—'), E'\n'));
  return new;
end $$;
drop trigger if exists alert_on_error on public.error_reports;
create trigger alert_on_error after insert on public.error_reports
  for each row execute function public.alert_on_error();

do $$
declare
  f text;
begin
  foreach f in array array['admin_get_alerts()', 'admin_set_alerts(boolean, text, text, text)', 'admin_test_alert()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
