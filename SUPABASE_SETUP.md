# SSP + Supabase Setup

## 1) Environment

1. Copy `.env.example` to `.env.local`.
2. Fill values:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 2) Database schema

1. Open Supabase SQL Editor.
2. Run `supabase/schema.sql`.

This creates:
- users profile table (`app_users`)
- news
- catalog for `counteraction` and `uav`
- test results
- final attempts (for strict final test flow)
- RLS and policies for employee/admin separation.

If schema was already applied earlier, run the new policy as well:

```sql
create policy "users_self_insert_employee"
on public.app_users
for insert
to authenticated
with check (
  auth_user_id = auth.uid()
  and role = 'employee'
  and status = 'active'
);
```

And add login resolver function for "login or email" auth:

```sql
create or replace function public.resolve_login_email(p_login text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select au.email
  from auth.users au
  join public.app_users p on p.auth_user_id = au.id
  where lower(p.login) = lower(p_login)
    and p.status = 'active'
  limit 1;
$$;

revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;
```

## 3) Link existing admin

If admin is already created in Supabase Auth:

1. Get admin auth user id in Supabase Auth panel.
2. Add row in `app_users`:

```sql
insert into public.app_users (auth_user_id, login, name, callsign, position, role, status)
values (
  'AUTH_USER_UUID_HERE',
  'admin',
  'Администратор ССП',
  'Центр-01',
  'Главный специалист',
  'admin',
  'active'
);
```

## 4) Current project state

- UI and route architecture are ready.
- App still runs with local prototype storage to keep everything runnable immediately.
- Next integration step: replace `lib/storage.ts` operations with Supabase queries table-by-table (users -> news -> tests -> catalogs).

## 5) Recommended rollout order

1. Auth (`/login`, `/register`)
2. `app_users` admin panel (`/admin/users`)
3. test results + final attempts
4. news
5. catalogs (`counteraction`, `uav`)
