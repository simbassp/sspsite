-- Тема ручного вопроса (ТТХ БПЛА / противодействие) и отдельные переключатели в настройках тестов.

alter table public.test_questions
  add column if not exists manual_topic text not null default 'uav_ttx';

alter table public.test_questions
  drop constraint if exists test_questions_manual_topic_check;

alter table public.test_questions
  add constraint test_questions_manual_topic_check
  check (manual_topic in ('uav_ttx', 'counteraction'));

alter table public.test_settings
  add column if not exists manual_bank_uav_ttx_enabled boolean not null default true;

alter table public.test_settings
  add column if not exists manual_bank_counteraction_enabled boolean not null default true;

update public.test_settings
set
  manual_bank_uav_ttx_enabled = coalesce(manual_bank_uav_ttx_enabled, true),
  manual_bank_counteraction_enabled = coalesce(manual_bank_counteraction_enabled, true)
where id = 1;
