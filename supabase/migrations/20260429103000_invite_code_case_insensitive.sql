-- Сверка кода приглашения без учёта регистра (как вводит пользователь при регистрации vs UPPER в админке).

create or replace function public.validate_invite_code(p_code text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.registration_invites i
    where upper(trim(i.code)) = upper(trim(coalesce(p_code, '')))
      and i.is_active = true
      and (i.max_uses is null or i.used_count < i.max_uses)
  );
$$;

create or replace function public.consume_invite_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.registration_invites
  set used_count = used_count + 1
  where upper(trim(code)) = upper(trim(coalesce(p_code, '')))
    and is_active = true
    and (max_uses is null or used_count < max_uses);

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;
