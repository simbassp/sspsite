-- Место положения: на базе / в командировке (профиль, админка).

alter table public.app_users
  add column if not exists duty_location text not null default 'base';

alter table public.app_users drop constraint if exists app_users_duty_location_check;
alter table public.app_users
  add constraint app_users_duty_location_check check (duty_location in ('base', 'deployment'));

comment on column public.app_users.duty_location is 'Место: base — на базе, deployment — в командировке.';

create or replace function public.update_my_duty_location(p_location text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loc text;
  v_updated int;
begin
  v_loc := lower(trim(coalesce(p_location, '')));
  if v_loc not in ('base', 'deployment') then
    return false;
  end if;

  update public.app_users
  set duty_location = v_loc
  where auth_user_id = auth.uid();

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke all on function public.update_my_duty_location(text) from public;
grant execute on function public.update_my_duty_location(text) to authenticated;
