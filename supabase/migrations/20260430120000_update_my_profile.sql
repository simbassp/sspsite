-- Разрешить сохранение имени/позывного для любого статуса (раньше только active → 0 строк и ложный «не удалось обновить»).
create or replace function public.update_my_profile(p_name text, p_callsign text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_callsign text;
  v_updated int;
begin
  v_name := nullif(trim(coalesce(p_name, '')), '');
  v_callsign := nullif(trim(coalesce(p_callsign, '')), '');
  if v_name is null or v_callsign is null then
    return false;
  end if;

  update public.app_users
  set name = v_name,
      callsign = v_callsign
  where auth_user_id = auth.uid();

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;
