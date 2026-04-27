-- Итоговый тест: окно подсчёта попыток после сброса админом + детализация результатов.

alter table public.app_users add column if not exists final_test_counting_from timestamptz;

alter table public.test_results add column if not exists questions_total integer;
alter table public.test_results add column if not exists questions_correct integer;

comment on column public.app_users.final_test_counting_from is 'Учитывать только итоговые попытки (test_results.type=final) с created_at >= этого времени для лимита 3 попытки; NULL = без сброса (все попытки с начала).';

comment on column public.test_results.questions_total is 'Число вопросов в попытке (итоговый/пробный).';
comment on column public.test_results.questions_correct is 'Число верных ответов в попытке.';

create table if not exists public.final_attempt_reset_events (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references public.app_users(id) on delete cascade,
  admin_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_final_reset_events_created on public.final_attempt_reset_events(created_at desc);
create index if not exists idx_final_reset_events_target on public.final_attempt_reset_events(target_user_id, created_at desc);

alter table public.final_attempt_reset_events enable row level security;
