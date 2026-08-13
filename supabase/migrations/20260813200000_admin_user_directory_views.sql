-- Справочник пользователей и поиск дубликатов позывных для Supabase Table Editor / SQL.

create or replace view public.admin_user_directory as
select
  u.id as app_user_id,
  u.auth_user_id,
  u.login,
  u.name,
  u.callsign,
  lower(trim(u.callsign)) as callsign_normalized,
  u.position,
  u.role,
  u.status,
  u.unit_assignment,
  u.created_at as registered_at,
  au.email as auth_email,
  au.created_at as auth_created_at,
  au.last_sign_in_at
from public.app_users u
left join auth.users au on au.id = u.auth_user_id;

comment on view public.admin_user_directory is
  'Пользователи с позывным, логином и email для просмотра в Supabase.';

create or replace view public.duplicate_callsign_accounts as
select
  lower(trim(callsign)) as callsign_normalized,
  min(callsign) as callsign_example,
  count(*) as account_count,
  array_agg(login order by created_at) as logins,
  array_agg(name order by created_at) as names,
  array_agg(id order by created_at) as app_user_ids,
  min(created_at) as first_registered_at,
  max(created_at) as last_registered_at
from public.app_users
where nullif(trim(callsign), '') is not null
group by lower(trim(callsign))
having count(*) > 1
order by count(*) desc, callsign_normalized;

comment on view public.duplicate_callsign_accounts is
  'Одинаковые позывные на разных аккаунтах (без учёта регистра).';
