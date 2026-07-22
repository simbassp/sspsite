-- Убираем full-table SUM на каждый heartbeat: инкремент счётчиков в site_settings.

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
begin
  if not exists (select 1 from public.app_users where id = p_user_id) then
    return;
  end if;

  if p_new_session then
    update public.app_users
    set visit_count = coalesce(visit_count, 0) + 1,
        analytics_session_started_at = now(),
        analytics_last_ping_at = now()
    where id = p_user_id;

    insert into public.site_settings (key, value, updated_at)
    values ('site_total_visits', to_jsonb(1), now())
    on conflict (key) do update
    set value = to_jsonb(coalesce((site_settings.value #>> '{}')::bigint, 0) + 1),
        updated_at = now();
  end if;

  if v_elapsed > 0 then
    update public.app_users
    set active_seconds_total = coalesce(active_seconds_total, 0) + v_elapsed,
        analytics_last_ping_at = now()
    where id = p_user_id;

    insert into public.site_settings (key, value, updated_at)
    values ('site_total_active_seconds', to_jsonb(v_elapsed), now())
    on conflict (key) do update
    set value = to_jsonb(coalesce((site_settings.value #>> '{}')::bigint, 0) + v_elapsed),
        updated_at = now();
  end if;
end;
$$;

create index if not exists idx_app_users_online_active_seen
  on public.app_users (status, is_online, last_seen_at desc)
  where status = 'active' and is_online = true;
