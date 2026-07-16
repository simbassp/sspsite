-- Подразделение: 1–3 взвод, 4 рота (профиль, админка, фильтры).

alter table public.app_users
  add column if not exists unit_assignment text;

alter table public.app_users drop constraint if exists app_users_unit_assignment_check;
alter table public.app_users
  add constraint app_users_unit_assignment_check check (
    unit_assignment is null
    or unit_assignment in ('platoon_1', 'platoon_2', 'platoon_3', 'company_4')
  );

comment on column public.app_users.unit_assignment is 'Подразделение: platoon_1..3 — взводы, company_4 — 4 рота.';

create or replace function public.update_my_unit_assignment(p_unit text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit text;
  v_updated int;
begin
  v_unit := lower(trim(coalesce(p_unit, '')));
  if v_unit = '' then
    v_unit := null;
  elsif v_unit not in ('platoon_1', 'platoon_2', 'platoon_3', 'company_4') then
    return false;
  end if;

  update public.app_users
  set unit_assignment = v_unit
  where auth_user_id = auth.uid();

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke all on function public.update_my_unit_assignment(text) from public;
grant execute on function public.update_my_unit_assignment(text) to authenticated;
