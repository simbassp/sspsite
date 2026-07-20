alter table public.app_users
  add column if not exists profile_cosmetic_bank_overlay text;

create table if not exists public.bank_test_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  questions_total integer not null check (questions_total >= 1),
  questions_correct integer not null check (questions_correct >= 0),
  score integer not null check (score >= 0 and score <= 100),
  duration_seconds integer,
  completed_at timestamptz not null default now()
);

create index if not exists bank_test_completions_user_idx
  on public.bank_test_completions(user_id, completed_at desc);
