alter table if exists public.news
  add column if not exists format jsonb not null default '{}'::jsonb;
