begin;

create table if not exists public.sent_users (
  slack_user_id text primary key,
  marked_by uuid default auth.uid() references public.app_profiles(id) on delete set null,
  marked_at timestamptz not null default now(),
  constraint sent_users_slack_user_id_length check (char_length(slack_user_id) between 1 and 100)
);

create index if not exists sent_users_marked_at_idx
  on public.sent_users (marked_at desc);

create or replace function public.is_app_approved(check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.app_profiles
    where id = check_user and status = 'approved'
  );
$$;

alter table public.sent_users enable row level security;

revoke all on public.sent_users from anon, authenticated;
grant select, insert, delete on public.sent_users to authenticated;
grant select, insert, update, delete on public.sent_users to service_role;

revoke all on function public.is_app_approved(uuid) from public;
grant execute on function public.is_app_approved(uuid) to authenticated, service_role;

drop policy if exists "Approved users read sent status" on public.sent_users;
create policy "Approved users read sent status" on public.sent_users
  for select to authenticated
  using (public.is_app_approved());

drop policy if exists "Approved users mark sent" on public.sent_users;
create policy "Approved users mark sent" on public.sent_users
  for insert to authenticated
  with check (public.is_app_approved() and marked_by = auth.uid());

drop policy if exists "Approved users unmark sent" on public.sent_users;
create policy "Approved users unmark sent" on public.sent_users
  for delete to authenticated
  using (public.is_app_approved());

notify pgrst, 'reload schema';

commit;
