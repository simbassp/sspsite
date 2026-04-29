-- Связь новости с автором и должность для отображения плашки
alter table if exists public.news
  add column if not exists created_by uuid references public.app_users(id) on delete set null;

alter table if exists public.news
  add column if not exists author_position text;
