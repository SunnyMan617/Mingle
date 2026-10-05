begin;

create table if not exists public.sent_users (
  slack_user_id text not null,
  marked_by uuid references public.app_profiles(id) on delete cascade,
  marked_at timestamptz not null default now(),
  constraint sent_users_slack_user_id_length check (char_length(slack_user_id) between 1 and 100)
);

alter table public.sent_users drop constraint if exists sent_users_pkey;
delete from public.sent_users where marked_by is null;
alter table public.sent_users
  alter column marked_by set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.sent_users'::regclass
      and conname = 'sent_users_pkey'
  ) then
    alter table public.sent_users
      add constraint sent_users_pkey primary key (slack_user_id, marked_by);
  end if;
end $$;

create index if not exists sent_users_marked_by_idx
  on public.sent_users (marked_by, marked_at desc);

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
  using (public.is_app_approved() and marked_by = auth.uid());

drop policy if exists "Approved users mark sent" on public.sent_users;
create policy "Approved users mark sent" on public.sent_users
  for insert to authenticated
  with check (public.is_app_approved() and marked_by = auth.uid());

drop policy if exists "Approved users unmark sent" on public.sent_users;
create policy "Approved users unmark sent" on public.sent_users
  for delete to authenticated
  using (public.is_app_approved() and marked_by = auth.uid());

notify pgrst, 'reload schema';

commit;
