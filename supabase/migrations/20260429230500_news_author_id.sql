-- Явная привязка новости к автору (app_users.id)
alter table if exists public.news
  add column if not exists author_id uuid references public.app_users(id) on delete set null;

-- По возможности заполняем author_id из ранее сохраненного created_by.
update public.news
set author_id = created_by
where author_id is null
  and created_by is not null;
