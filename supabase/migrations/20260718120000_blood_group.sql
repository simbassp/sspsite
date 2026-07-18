alter table public.app_users add column if not exists blood_group text;

comment on column public.app_users.blood_group is 'Группа крови с резус-фактором.';
