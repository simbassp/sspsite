-- Пользовательские категории БПЛА (базовые остаются в коде приложения).
create table if not exists public.uav_category_presets (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  created_at timestamptz not null default now(),
  constraint uav_category_presets_label_unique unique (label)
);

create index if not exists idx_uav_category_presets_created_at
  on public.uav_category_presets(created_at asc);

alter table public.uav_category_presets enable row level security;
