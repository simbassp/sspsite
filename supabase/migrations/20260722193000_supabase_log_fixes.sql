-- Безопасно для prod: можно выполнить целиком в Supabase SQL Editor.
-- Устраняет 404 registration_email_taken и добавляет недостающие колонки test_results.

-- 1) Проверка email при регистрации (404 в логах, если функции нет)
create or replace function public.registration_email_taken(p_email text)
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select exists (
    select 1
    from auth.users u
    where lower(trim(u.email)) = lower(trim(coalesce(p_email, '')))
      and length(trim(coalesce(p_email, ''))) > 0
  );
$$;

revoke all on function public.registration_email_taken(text) from public;
grant execute on function public.registration_email_taken(text) to service_role;

-- 2) Колонки test_results (400 в логах, если их нет)
alter table public.test_results add column if not exists questions_total integer;
alter table public.test_results add column if not exists questions_correct integer;
alter table public.test_results add column if not exists started_at timestamptz;
alter table public.test_results add column if not exists finished_at timestamptz;
alter table public.test_results add column if not exists duration_seconds integer;
alter table public.test_results add column if not exists is_completed boolean not null default true;

-- 3) Индекс для фильтров по типу + периоду (страница «Результаты»)
create index if not exists idx_test_results_type_created_desc
  on public.test_results (type, created_at desc);
