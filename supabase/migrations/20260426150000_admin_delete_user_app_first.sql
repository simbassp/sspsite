-- Исправление: сначала удаляем public.app_users, потом auth.users, чтобы не оставались «сироты» в app_users.
create or replace function public.admin_delete_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_can_manage_users boolean;
  v_auth_user_id uuid;
begin
  select exists (
    select 1
    from public.app_users u
    where u.auth_user_id = auth.uid()
      and (u.role = 'admin' or u.can_manage_users = true)
      and u.status = 'active'
  )
  into v_can_manage_users;

  if not coalesce(v_can_manage_users, false) then
    raise exception 'Недостаточно прав для удаления пользователя';
  end if;

  select auth_user_id
  into v_auth_user_id
  from public.app_users
  where id = p_user_id;

  if not found then
    return true;
  end if;

  delete from public.app_users
  where id = p_user_id;

  if v_auth_user_id is not null then
    delete from auth.users
    where id = v_auth_user_id;
  end if;

  return true;
end;
$$;
