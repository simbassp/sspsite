alter table public.app_users
  add column if not exists profile_cosmetic_avatar_frame text,
  add column if not exists profile_cosmetic_name_color text;

create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  achievement_id text not null,
  unlocked_at timestamptz not null default now(),
  unique (user_id, achievement_id)
);

create index if not exists user_achievements_user_idx on public.user_achievements(user_id, unlocked_at desc);
