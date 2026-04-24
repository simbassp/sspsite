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
  auth_user_id uuid unique,
  login text not null unique,
  name text not null,
  callsign text not null,
  position text not null,
  role public.user_role not null default 'employee',
  status public.user_status not null default 'active',
  created_at timestamptz not null default now()
);

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

create index if not exists idx_app_users_login on public.app_users(login);
create index if not exists idx_app_users_role on public.app_users(role);
create index if not exists idx_test_results_user_id on public.test_results(user_id);
create index if not exists idx_test_results_type_status on public.test_results(type, status);
create index if not exists idx_catalog_items_kind on public.catalog_items(kind);

create or replace function public.is_admin()
returns boolean
language sql
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

alter table public.app_users enable row level security;
alter table public.news enable row level security;
alter table public.catalog_items enable row level security;
alter table public.test_results enable row level security;
alter table public.final_attempts enable row level security;

-- app_users
create policy "users_self_read"
on public.app_users
for select
to authenticated
using (auth_user_id = auth.uid() or public.is_admin());

create policy "users_admin_update"
on public.app_users
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "users_admin_insert"
on public.app_users
for insert
to authenticated
with check (public.is_admin());

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
using (public.is_admin());

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
using (public.is_admin())
with check (public.is_admin());

-- catalog
create policy "catalog_authenticated_read"
on public.catalog_items
for select
to authenticated
using (true);

create policy "catalog_admin_write"
on public.catalog_items
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- test_results
create policy "results_self_or_admin_read"
on public.test_results
for select
to authenticated
using (
  public.is_admin()
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
