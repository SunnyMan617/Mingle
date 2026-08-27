-- Run this file in the SQL editor for the Supabase project in SUPABASE_URL.
-- It is idempotent and can be run again safely.

create table if not exists public.app_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  username text not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null
);

create unique index if not exists app_profiles_email_lower_idx on public.app_profiles (lower(email));
create unique index if not exists app_profiles_username_lower_idx on public.app_profiles (lower(username));
create index if not exists app_profiles_status_created_idx on public.app_profiles (status, created_at desc);

-- Profile rows are created by the server-side registration action. Remove older
-- triggers because a failed auth trigger prevents registration entirely.
drop trigger if exists on_auth_user_created_create_app_profile on auth.users;
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_app_user() cascade;
drop function if exists public.handle_new_user() cascade;

create or replace function public.is_app_admin(check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.app_profiles
    where id = check_user and role = 'admin' and status = 'approved'
  );
$$;

alter table public.app_profiles enable row level security;
revoke all on public.app_profiles from anon, authenticated;
grant select on public.app_profiles to authenticated;
grant update (status, approved_at, approved_by) on public.app_profiles to authenticated;
grant select, insert, update, delete on public.app_profiles to service_role;

revoke all on function public.is_app_admin(uuid) from public;
grant execute on function public.is_app_admin(uuid) to authenticated, service_role;

drop policy if exists "Users read their own profile" on public.app_profiles;
create policy "Users read their own profile" on public.app_profiles
  for select to authenticated
  using (id = auth.uid() or public.is_app_admin());

drop policy if exists "Admins update user approval" on public.app_profiles;
create policy "Admins update user approval" on public.app_profiles
  for update to authenticated
  using (public.is_app_admin() and role = 'user')
  with check (public.is_app_admin() and role = 'user');

notify pgrst, 'reload schema';
