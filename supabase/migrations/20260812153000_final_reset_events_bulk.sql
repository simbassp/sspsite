-- Массовый сброс попыток итогового теста: target_user_id = null означает «всем».

alter table public.final_attempt_reset_events
  alter column target_user_id drop not null;

comment on column public.final_attempt_reset_events.target_user_id is
  'Пользователь, которому сбросили попытки. NULL = сброс для всех.';
