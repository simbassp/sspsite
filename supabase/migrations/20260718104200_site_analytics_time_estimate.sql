-- Уточнённая оценка общего времени + базовые минуты за каждую новую сессию.

update public.app_users u
set active_seconds_total = coalesce((
  select sum(tr.duration_seconds)::bigint
  from public.test_results tr
  where tr.user_id = u.id
    and tr.duration_seconds is not null
    and tr.duration_seconds > 0
), 0) + coalesce(u.visit_count, 0) * 1200;

insert into public.site_settings (key, value, updated_at)
select 'site_total_active_seconds', to_jsonb(coalesce(sum(active_seconds_total), 0)), now()
from public.app_users
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

create or replace function public.record_site_analytics(
  p_user_id uuid,
  p_new_session boolean default false,
  p_elapsed_seconds integer default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_elapsed bigint := greatest(0, least(coalesce(p_elapsed_seconds, 0), 600));
  v_session_baseline bigint := 0;
  v_visits bigint;
  v_seconds bigint;
begin
  if not exists (select 1 from public.app_users where id = p_user_id) then
    return;
  end if;

  if p_new_session then
    v_session_baseline := 300;
    update public.app_users
    set visit_count = coalesce(visit_count, 0) + 1,
        analytics_session_started_at = now(),
        analytics_last_ping_at = now()
    where id = p_user_id;

    select coalesce(sum(visit_count), 0) into v_visits from public.app_users;
    insert into public.site_settings (key, value, updated_at)
    values ('site_total_visits', to_jsonb(v_visits), now())
    on conflict (key) do update
    set value = excluded.value,
        updated_at = now();
  end if;

  if v_elapsed > 0 or v_session_baseline > 0 then
    update public.app_users
    set active_seconds_total = coalesce(active_seconds_total, 0) + v_elapsed + v_session_baseline,
        analytics_last_ping_at = now()
    where id = p_user_id;

    select coalesce(sum(active_seconds_total), 0) into v_seconds from public.app_users;
    insert into public.site_settings (key, value, updated_at)
    values ('site_total_active_seconds', to_jsonb(v_seconds), now())
    on conflict (key) do update
    set value = excluded.value,
        updated_at = now();
  end if;
end;
$$;

revoke all on function public.record_site_analytics(uuid, boolean, integer) from public;
