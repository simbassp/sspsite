-- Проверка занятости email в auth.users (только service_role / серверные вызовы).
create or replace function public.registration_email_taken(p_email text)
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select exists (
    select 1
    from auth.users u
    where lower(trim(u.email)) = lower(trim(coalesce(p_email, '')))
      and length(trim(coalesce(p_email, ''))) > 0
  );
$$;

revoke all on function public.registration_email_taken(text) from public;
grant execute on function public.registration_email_taken(text) to service_role;
