alter table if exists public.app_users
  add column if not exists avatar_url text;

comment on column public.app_users.avatar_url is 'Относительный путь к фото профиля (uploads/avatars/...).';
