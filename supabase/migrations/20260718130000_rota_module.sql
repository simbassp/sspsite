alter table public.app_users add column if not exists rota_module smallint;

alter table public.app_users drop constraint if exists app_users_rota_module_check;
alter table public.app_users add constraint app_users_rota_module_check
  check (rota_module is null or (rota_module >= 1 and rota_module <= 15));

comment on column public.app_users.rota_module is 'Модуль 4 роты (1–15).';
