alter table public.test_results add column if not exists started_at timestamptz;
alter table public.test_results add column if not exists finished_at timestamptz;
alter table public.test_results add column if not exists duration_seconds integer;
alter table public.test_results add column if not exists is_completed boolean not null default true;

comment on column public.test_results.started_at is 'Время начала попытки теста.';
comment on column public.test_results.finished_at is 'Время завершения попытки теста.';
comment on column public.test_results.duration_seconds is 'Фактическая длительность попытки в секундах.';
comment on column public.test_results.is_completed is 'Попытка завершена корректно (true) или прервана (false).';

create index if not exists idx_test_results_type_completed_created
  on public.test_results(type, is_completed, created_at desc);
