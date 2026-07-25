-- Удаление модуля, зачётов, командировок, медалей, премий и связанных таблиц.

alter table if exists public.app_users drop column if exists rota_module;

drop table if exists public.personnel_requests cascade;
drop table if exists public.personnel_premiums cascade;
drop table if exists public.personnel_medals cascade;
drop table if exists public.personnel_deployments cascade;
drop table if exists public.personnel_exams cascade;

-- Медали за выслугу (tenure achievements)
drop table if exists public.user_achievements cascade;

alter table if exists public.app_users drop column if exists employment_date;
