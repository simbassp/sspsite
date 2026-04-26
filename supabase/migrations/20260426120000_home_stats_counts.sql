-- Выполните на базе (или через supabase db push), если основной schema.sql уже применён ранее.
create or replace function public.home_stats_counts()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'active_users', (select count(*)::int from public.app_users where status = 'active'),
    'news_count', (select count(*)::int from public.news)
  );
$$;

revoke all on function public.home_stats_counts() from public;
grant execute on function public.home_stats_counts() to authenticated;
