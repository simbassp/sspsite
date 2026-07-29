-- Восстановление итогового теста после обрыва (1 раз за попытку, окно 5 минут).

alter table public.final_attempts
  add column if not exists question_ids jsonb not null default '[]'::jsonb;

alter table public.final_attempts
  add column if not exists recovery_used boolean not null default false;

alter table public.final_attempts
  add column if not exists interrupted_at timestamptz;

alter table public.final_attempts
  add column if not exists updated_at timestamptz not null default now();

comment on column public.final_attempts.question_ids is 'Порядок вопросов текущей попытки (uuid).';
comment on column public.final_attempts.recovery_used is 'Использовано ли единственное восстановление после обрыва.';
comment on column public.final_attempts.interrupted_at is 'Момент обрыва (закрытие вкладки / обновление).';
