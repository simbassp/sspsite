-- Тактическая медицина: новый kind каталога + права + категории.

alter type public.catalog_kind add value if not exists 'tactical_medicine';

alter table public.app_users
  add column if not exists can_manage_tactical_medicine boolean not null default false;

create table if not exists public.tactical_medicine_category_presets (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  created_at timestamptz not null default now(),
  constraint tactical_medicine_category_presets_label_unique unique (label)
);

create index if not exists idx_tactical_medicine_category_presets_created_at
  on public.tactical_medicine_category_presets(created_at asc);

alter table public.tactical_medicine_category_presets enable row level security;

drop policy if exists "tactical_medicine_categories_read" on public.tactical_medicine_category_presets;
create policy "tactical_medicine_categories_read"
on public.tactical_medicine_category_presets
for select
to authenticated
using (true);

drop policy if exists "tactical_medicine_categories_admin_write" on public.tactical_medicine_category_presets;
create policy "tactical_medicine_categories_admin_write"
on public.tactical_medicine_category_presets
for all
to authenticated
using (public.can_manage_content())
with check (public.can_manage_content());

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
        or u.can_manage_tactical_medicine = true
      )
  );
$$;

comment on column public.app_users.can_manage_tactical_medicine is
  'Право управлять разделом «Тактическая медицина».';
