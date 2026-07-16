alter table public.app_users add column if not exists employment_date date;
comment on column public.app_users.employment_date is 'Дата трудоустройства (для расчёта стажа).';
