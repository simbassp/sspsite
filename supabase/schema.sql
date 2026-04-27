-- Run this script in Supabase SQL editor.
-- It creates the minimum schema for the SSP platform.

create extension if not exists pgcrypto;

create type public.user_role as enum ('employee', 'admin');
create type public.user_status as enum ('active', 'inactive');
create type public.test_type as enum ('trial', 'final');
create type public.test_status as enum ('passed', 'failed');
create type public.news_priority as enum ('high', 'normal');
create type public.catalog_kind as enum ('counteraction', 'uav');

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  login text not null unique,
  name text not null,
  callsign text not null,
  position text not null,
  can_manage_content boolean not null default false,
  can_manage_news boolean not null default false,
  can_manage_tests boolean not null default false,
  can_manage_results boolean not null default false,
  can_manage_uav boolean not null default false,
  can_manage_counteraction boolean not null default false,
  can_manage_users boolean not null default false,
  role public.user_role not null default 'employee',
  status public.user_status not null default 'active',
  created_at timestamptz not null default now()
);

alter table if exists public.app_users add column if not exists can_manage_news boolean not null default false;
alter table if exists public.app_users add column if not exists can_manage_tests boolean not null default false;
alter table if exists public.app_users add column if not exists can_manage_results boolean not null default false;
alter table if exists public.app_users add column if not exists can_manage_uav boolean not null default false;
alter table if exists public.app_users add column if not exists can_manage_counteraction boolean not null default false;
alter table if exists public.app_users add column if not exists can_manage_users boolean not null default false;

create table if not exists public.news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  priority public.news_priority not null default 'normal',
  author text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  kind public.catalog_kind not null,
  title text not null,
  category text not null,
  summary text not null,
  image text not null,
  specs jsonb not null default '[]'::jsonb,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.test_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  type public.test_type not null,
  status public.test_status not null,
  score integer not null check (score >= 0 and score <= 100),
  created_at timestamptz not null default now()
);

create table if not exists public.final_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.app_users(id) on delete cascade,
  started_at timestamptz not null default now(),
  question_index integer not null default 0,
  answers jsonb not null default '{}'::jsonb
);

create table if not exists public.test_questions (
  id uuid primary key default gen_random_uuid(),
  type public.test_type not null,
  text text not null,
  options jsonb not null check (jsonb_typeof(options) = 'array'),
  correct_index integer not null default 0,
  time_limit_sec integer not null default 45 check (time_limit_sec >= 5),
  order_index integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.test_settings (
  id integer primary key default 1 check (id = 1),
  trial_question_count integer not null default 10 check (trial_question_count >= 1),
  final_question_count integer not null default 15 check (final_question_count >= 1),
  time_per_question_sec integer not null default 10 check (time_per_question_sec >= 5),
  uav_auto_generation boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.registration_invites (
  code text primary key,
  is_active boolean not null default true,
  max_uses integer,
  used_count integer not null default 0,
  created_at timestamptz not null default now(),
  check (max_uses is null or max_uses > 0),
  check (used_count >= 0)
);

insert into public.test_settings (id, trial_question_count, final_question_count, time_per_question_sec, uav_auto_generation)
values (1, 10, 15, 10, true)
on conflict (id) do nothing;

alter table public.test_settings add column if not exists time_per_question_sec integer;
alter table public.test_settings add column if not exists uav_auto_generation boolean;
update public.test_settings
set
  time_per_question_sec = coalesce(time_per_question_sec, 10),
  uav_auto_generation = coalesce(uav_auto_generation, true)
where id = 1;
alter table public.test_settings alter column time_per_question_sec set default 10;
alter table public.test_settings alter column uav_auto_generation set default true;
alter table public.test_settings alter column time_per_question_sec set not null;
alter table public.test_settings alter column uav_auto_generation set not null;

create index if not exists idx_app_users_login on public.app_users(login);
create index if not exists idx_app_users_role on public.app_users(role);
create index if not exists idx_test_results_user_id on public.test_results(user_id);
create index if not exists idx_test_results_type_status on public.test_results(type, status);
create index if not exists idx_test_results_user_created_desc on public.test_results(user_id, created_at desc);
create index if not exists idx_catalog_items_kind on public.catalog_items(kind);
create index if not exists idx_catalog_items_kind_created_desc on public.catalog_items(kind, created_at desc);
create index if not exists idx_test_questions_type_order on public.test_questions(type, order_index);
create index if not exists idx_test_questions_active_order on public.test_questions(is_active, order_index);

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.app_users u
    where u.auth_user_id = auth.uid()
      and u.role = 'admin'
      and u.status = 'active'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.can_manage_content()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.app_users u
    where u.auth_user_id = auth.uid()
      and u.status = 'active'
      and (
        u.role = 'admin'
        or u.can_manage_content = true
        or u.can_manage_news = true
        or u.can_manage_tests = true
        or u.can_manage_uav = true
        or u.can_manage_counteraction = true
      )
  );
$$;

revoke all on function public.can_manage_content() from public;
grant execute on function public.can_manage_content() to authenticated;

create or replace function public.can_manage_users()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.app_users u
    where u.auth_user_id = auth.uid()
      and u.status = 'active'
      and (u.role = 'admin' or u.can_manage_users = true)
  );
$$;

revoke all on function public.can_manage_users() from public;
grant execute on function public.can_manage_users() to authenticated;

create or replace function public.can_manage_results()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.app_users u
    where u.auth_user_id = auth.uid()
      and u.status = 'active'
      and (u.role = 'admin' or u.can_manage_results = true)
  );
$$;

revoke all on function public.can_manage_results() from public;
grant execute on function public.can_manage_results() to authenticated;

create or replace function public.resolve_login_email(p_login text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select au.email
  from auth.users au
  join public.app_users p on p.auth_user_id = au.id
  where lower(p.login) = lower(p_login)
    and p.status = 'active'
  limit 1;
$$;

revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;

create or replace function public.validate_invite_code(p_code text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.registration_invites i
    where upper(trim(i.code)) = upper(trim(coalesce(p_code, '')))
      and i.is_active = true
      and (i.max_uses is null or i.used_count < i.max_uses)
  );
$$;

revoke all on function public.validate_invite_code(text) from public;
grant execute on function public.validate_invite_code(text) to anon, authenticated;

create or replace function public.consume_invite_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.registration_invites
  set used_count = used_count + 1
  where upper(trim(code)) = upper(trim(coalesce(p_code, '')))
    and is_active = true
    and (max_uses is null or used_count < max_uses);

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

create or replace function public.admin_delete_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_can_manage_users boolean;
  v_auth_user_id uuid;
begin
  select exists (
    select 1
    from public.app_users u
    where u.auth_user_id = auth.uid()
      and (u.role = 'admin' or u.can_manage_users = true)
      and u.status = 'active'
  )
  into v_can_manage_users;

  if not coalesce(v_can_manage_users, false) then
    raise exception 'Недостаточно прав для удаления пользователя';
  end if;

  select auth_user_id
  into v_auth_user_id
  from public.app_users
  where id = p_user_id;

  if not found then
    return true;
  end if;

  -- Сначала `app_users` (и каскады к результатам/попыткам), иначе строка могла остаться, а UI снова подтянет её с сервера.
  delete from public.app_users
  where id = p_user_id;

  if v_auth_user_id is not null then
    delete from auth.users
    where id = v_auth_user_id;
  end if;

  return true;
end;
$$;

revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated;

create or replace function public.update_my_profile(p_name text, p_callsign text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_callsign text;
begin
  v_name := nullif(trim(coalesce(p_name, '')), '');
  v_callsign := nullif(trim(coalesce(p_callsign, '')), '');
  if v_name is null or v_callsign is null then
    return false;
  end if;

  update public.app_users
  set name = v_name,
      callsign = v_callsign
  where auth_user_id = auth.uid()
    and status = 'active';

  return found;
end;
$$;

revoke all on function public.update_my_profile(text, text) from public;
grant execute on function public.update_my_profile(text, text) to authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_login text;
  v_name text;
  v_callsign text;
  v_position text;
  v_invite_code text;
begin
  v_invite_code := nullif(trim(coalesce(new.raw_user_meta_data->>'invite_code', '')), '');
  if v_invite_code is null or public.consume_invite_code(v_invite_code) = false then
    raise exception 'У вас нет приглашения';
  end if;

  v_login := nullif(trim(coalesce(new.raw_user_meta_data->>'login', '')), '');
  if v_login is null then
    v_login := split_part(coalesce(new.email, 'user'), '@', 1) || '-' || left(new.id::text, 8);
  end if;

  v_name := nullif(trim(coalesce(new.raw_user_meta_data->>'name', '')), '');
  if v_name is null then
    v_name := 'Сотрудник';
  end if;

  v_callsign := nullif(trim(coalesce(new.raw_user_meta_data->>'callsign', '')), '');
  if v_callsign is null then
    v_callsign := 'Новичок';
  end if;

  v_position := nullif(trim(coalesce(new.raw_user_meta_data->>'position', '')), '');
  if v_position is null then
    v_position := 'Специалист';
  end if;

  insert into public.app_users (auth_user_id, login, name, callsign, position, role, status)
  values (new.id, v_login, v_name, v_callsign, v_position, 'employee', 'active')
  on conflict (auth_user_id) do update
  set login = excluded.login,
      name = excluded.name,
      callsign = excluded.callsign,
      position = excluded.position;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

alter table public.app_users enable row level security;
alter table public.news enable row level security;
alter table public.catalog_items enable row level security;
alter table public.test_results enable row level security;
alter table public.final_attempts enable row level security;
alter table public.test_questions enable row level security;
alter table public.test_settings enable row level security;
alter table public.registration_invites enable row level security;

-- app_users
create policy "users_self_read"
on public.app_users
for select
to authenticated
using (auth_user_id = auth.uid() or public.can_manage_users());

create policy "users_results_read"
on public.app_users
for select
to authenticated
using (public.can_manage_results());

create policy "users_admin_update"
on public.app_users
for update
to authenticated
using (public.can_manage_users())
with check (public.can_manage_users());

create policy "users_admin_insert"
on public.app_users
for insert
to authenticated
with check (public.can_manage_users());

create policy "users_self_insert_employee"
on public.app_users
for insert
to authenticated
with check (
  auth_user_id = auth.uid()
  and role = 'employee'
  and status = 'active'
);

create policy "users_admin_delete"
on public.app_users
for delete
to authenticated
using (public.can_manage_users());

-- news
create policy "news_authenticated_read"
on public.news
for select
to authenticated
using (true);

create policy "news_admin_write"
on public.news
for all
to authenticated
using (public.can_manage_content())
with check (public.can_manage_content());

-- catalog
create policy "catalog_authenticated_read"
on public.catalog_items
for select
to authenticated
using (true);

create policy "catalog_anon_read"
on public.catalog_items
for select
to anon
using (true);

create policy "catalog_admin_write"
on public.catalog_items
for all
to authenticated
using (public.can_manage_content())
with check (public.can_manage_content());

-- test_results
create policy "results_self_or_admin_read"
on public.test_results
for select
to authenticated
using (
  public.is_admin()
  or public.can_manage_results()
  or user_id in (select id from public.app_users where auth_user_id = auth.uid())
);

create policy "results_self_or_admin_insert"
on public.test_results
for insert
to authenticated
with check (
  public.is_admin()
  or user_id in (select id from public.app_users where auth_user_id = auth.uid())
);

-- final_attempts
create policy "attempts_self_or_admin_read"
on public.final_attempts
for select
to authenticated
using (
  public.is_admin()
  or user_id in (select id from public.app_users where auth_user_id = auth.uid())
);

create policy "attempts_self_or_admin_write"
on public.final_attempts
for all
to authenticated
using (
  public.is_admin()
  or user_id in (select id from public.app_users where auth_user_id = auth.uid())
)
with check (
  public.is_admin()
  or user_id in (select id from public.app_users where auth_user_id = auth.uid())
);

-- test_questions
create policy "test_questions_read"
on public.test_questions
for select
to authenticated
using (true);

create policy "test_questions_admin_write"
on public.test_questions
for all
to authenticated
using (public.can_manage_content())
with check (public.can_manage_content());

-- test_settings
create policy "test_settings_read"
on public.test_settings
for select
to authenticated
using (true);

create policy "test_settings_admin_write"
on public.test_settings
for all
to authenticated
using (public.can_manage_content())
with check (public.can_manage_content());

-- registration_invites
create policy "registration_invites_admin_read"
on public.registration_invites
for select
to authenticated
using (public.is_admin());

create policy "registration_invites_admin_write"
on public.registration_invites
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Сводные счётчики для главной (любой authenticated; definer обходит построчные ограничения на чтение app_users)
create or replace function public.home_stats_counts()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'active_users', (select count(*)::int from public.app_users where status = 'active'),
    'news_count', (select count(*)::int from public.news)
  );
$$;

revoke all on function public.home_stats_counts() from public;
grant execute on function public.home_stats_counts() to authenticated;
