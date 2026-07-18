-- Сохранение взвода и отделения 4 роты при регистрации (metadata signUp).

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_login text;
  v_name text;
  v_callsign text;
  v_position text;
  v_invite_code text;
  v_unit text;
  v_rota_platoon smallint;
  v_rota_section smallint;
begin
  v_invite_code := nullif(trim(coalesce(new.raw_user_meta_data->>'invite_code', '')), '');
  if v_invite_code is null or public.consume_invite_code(v_invite_code) = false then
    raise exception 'У вас нет приглашения';
  end if;

  v_login := nullif(trim(coalesce(new.raw_user_meta_data->>'login', '')), '');
  if v_login is null then
    v_login := split_part(coalesce(new.email, 'user'), '@', 1) || '-' || left(new.id::text, 8);
  end if;

  v_name := nullif(trim(coalesce(new.raw_user_meta_data->>'name', '')), '');
  if v_name is null then
    v_name := 'Сотрудник';
  end if;

  v_callsign := nullif(trim(coalesce(new.raw_user_meta_data->>'callsign', '')), '');
  if v_callsign is null then
    v_callsign := 'Новичок';
  end if;

  v_position := nullif(trim(coalesce(new.raw_user_meta_data->>'position', '')), '');
  if v_position is null then
    v_position := 'Специалист';
  end if;

  v_unit := lower(nullif(trim(coalesce(new.raw_user_meta_data->>'unit_assignment', '')), ''));
  if v_unit is not null and v_unit not in ('platoon_1', 'platoon_2', 'platoon_3', 'company_4', 'staff', 'office') then
    v_unit := null;
  end if;

  v_rota_platoon := null;
  v_rota_section := null;
  if v_unit = 'company_4' then
    begin
      v_rota_platoon := nullif(trim(coalesce(new.raw_user_meta_data->>'rota_platoon', '')), '')::smallint;
    exception
      when others then
        v_rota_platoon := null;
    end;
    if v_rota_platoon not in (1, 2) then
      v_rota_platoon := null;
    end if;

    begin
      v_rota_section := nullif(trim(coalesce(new.raw_user_meta_data->>'rota_section', '')), '')::smallint;
    exception
      when others then
        v_rota_section := null;
    end;
    if v_rota_section is null or v_rota_section < 1 or v_rota_section > 4 then
      v_rota_section := null;
    end if;
  end if;

  insert into public.app_users (
    auth_user_id,
    login,
    name,
    callsign,
    position,
    role,
    status,
    unit_assignment,
    rota_platoon,
    rota_section
  )
  values (
    new.id,
    v_login,
    v_name,
    v_callsign,
    v_position,
    'employee',
    'active',
    v_unit,
    v_rota_platoon,
    v_rota_section
  )
  on conflict (auth_user_id) do update
  set login = excluded.login,
      name = excluded.name,
      callsign = excluded.callsign,
      position = excluded.position,
      unit_assignment = coalesce(excluded.unit_assignment, public.app_users.unit_assignment),
      rota_platoon = coalesce(excluded.rota_platoon, public.app_users.rota_platoon),
      rota_section = coalesce(excluded.rota_section, public.app_users.rota_section);

  return new;
end;
$$;
