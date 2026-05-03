-- Просмотр списка пользователей и чужих профилей без редактирования (отдельно от can_manage_users).
alter table if exists public.app_users
  add column if not exists can_view_user_list boolean not null default false;

comment on column public.app_users.can_view_user_list is 'Доступ к разделу «Пользователи» и просмотр профилей других (без смены прав, удаления, места положения)';
