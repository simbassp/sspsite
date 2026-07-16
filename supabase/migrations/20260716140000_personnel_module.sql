-- Модуль «4 рота»: личное дело, заявки, уведомления, флаг включения.

alter table public.app_users add column if not exists can_moderate_personnel boolean not null default false;
comment on column public.app_users.can_moderate_personnel is 'Модерация заявок личного дела 4 роты.';

alter table public.app_users add column if not exists rota_platoon smallint;
alter table public.app_users add column if not exists rota_section smallint;
alter table public.app_users drop constraint if exists app_users_rota_platoon_check;
alter table public.app_users add constraint app_users_rota_platoon_check check (
  rota_platoon is null or rota_platoon in (1, 2)
);
alter table public.app_users drop constraint if exists app_users_rota_section_check;
alter table public.app_users add constraint app_users_rota_section_check check (
  rota_section is null or rota_section between 1 and 4
);
comment on column public.app_users.rota_platoon is 'Взвод внутри 4 роты (1 или 2).';
comment on column public.app_users.rota_section is 'Отделение внутри взвода 4 роты (1–4).';

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.site_settings (key, value)
values ('personnel_module_enabled', 'false'::jsonb)
on conflict (key) do nothing;

insert into public.site_settings (key, value)
values ('personnel_moderation_enabled', 'true'::jsonb)
on conflict (key) do nothing;

create table if not exists public.personnel_exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  exam_type text not null check (exam_type in ('ttx', 'medicine', 'verification', 'physical', 'shooting')),
  status text not null default 'passed' check (status in ('passed', 'failed')),
  passed_at date,
  expires_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, exam_type)
);

create table if not exists public.personnel_deployments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  date_from date not null,
  date_to date not null,
  uav_hits integer not null default 0 check (uav_hits >= 0),
  premium_amount integer not null default 0 check (premium_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (date_to >= date_from)
);

create table if not exists public.personnel_medals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  medal_type text not null,
  title text not null,
  awarded_at date not null,
  created_at timestamptz not null default now()
);

create table if not exists public.personnel_premiums (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  title text not null default 'Премия за сбитие',
  amount integer not null default 0 check (amount >= 0),
  awarded_at date not null,
  deployment_id uuid references public.personnel_deployments(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.personnel_licenses (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  categories text[] not null default '{}'::text[],
  updated_at timestamptz not null default now()
);

create table if not exists public.personnel_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  request_type text not null check (request_type in ('medal', 'premium', 'deployment', 'exam')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewer_id uuid references public.app_users(id) on delete set null,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists personnel_requests_status_idx on public.personnel_requests(status, created_at desc);
create index if not exists personnel_exams_user_idx on public.personnel_exams(user_id);
create index if not exists personnel_deployments_user_idx on public.personnel_deployments(user_id, date_from desc);

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  kind text not null default 'info',
  title text not null,
  body text not null default '',
  href text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists app_notifications_user_idx on public.app_notifications(user_id, is_read, created_at desc);

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
  v_unit text;
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

  v_unit := lower(nullif(trim(coalesce(new.raw_user_meta_data->>'unit_assignment', '')), ''));
  if v_unit is not null and v_unit not in ('platoon_1', 'platoon_2', 'platoon_3', 'company_4', 'staff', 'office') then
    v_unit := null;
  end if;

  insert into public.app_users (auth_user_id, login, name, callsign, position, role, status, unit_assignment)
  values (new.id, v_login, v_name, v_callsign, v_position, 'employee', 'active', v_unit)
  on conflict (auth_user_id) do update
  set login = excluded.login,
      name = excluded.name,
      callsign = excluded.callsign,
      position = excluded.position,
      unit_assignment = coalesce(excluded.unit_assignment, public.app_users.unit_assignment);

  return new;
end;
$$;

alter table public.site_settings enable row level security;
alter table public.personnel_exams enable row level security;
alter table public.personnel_deployments enable row level security;
alter table public.personnel_medals enable row level security;
alter table public.personnel_premiums enable row level security;
alter table public.personnel_licenses enable row level security;
alter table public.personnel_requests enable row level security;
alter table public.app_notifications enable row level security;
