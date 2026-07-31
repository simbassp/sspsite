-- Окно закрытия доступа к итоговому тесту (управляет только администратор).

alter table public.test_settings
  add column if not exists final_test_closed_from timestamptz;

alter table public.test_settings
  add column if not exists final_test_closed_until timestamptz;

alter table public.test_settings
  add column if not exists final_test_closure_message text;

comment on column public.test_settings.final_test_closed_from is 'С какого момента итоговый тест закрыт.';
comment on column public.test_settings.final_test_closed_until is 'До какого момента итоговый тест закрыт (null = без даты окончания).';
comment on column public.test_settings.final_test_closure_message is 'Сообщение пользователям при закрытии.';
