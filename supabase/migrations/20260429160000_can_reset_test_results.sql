alter table public.app_users add column if not exists can_reset_test_results boolean not null default false;

comment on column public.app_users.can_reset_test_results is 'Право сбрасывать окно попыток итогового теста (final_test_counting_from), отдельно от просмотра результатов.';
