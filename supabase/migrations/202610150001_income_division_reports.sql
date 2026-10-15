-- Monthly income division reports. Expenses remain in the existing expenses
-- table; these records only persist the manager's target and the snapshot
-- published to members for a competence month.
create table if not exists public.income_division_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  competence date not null,
  monthly_target numeric(18,2) not null default 0 check (monthly_target >= 0),
  status text not null default 'draft' check (status in ('draft', 'sent')),
  sent_at timestamptz,
  sent_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, competence)
);

create table if not exists public.income_division_report_items (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.income_division_reports(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  member_user_id uuid references auth.users(id) on delete set null,
  member_contact_id uuid references public.organization_contacts(id) on delete set null,
  member_ref text not null,
  member_name text not null,
  personal_expenses numeric(18,2) not null default 0,
  holding_expenses numeric(18,2) not null default 0,
  total_expenses numeric(18,2) not null default 0,
  monthly_target numeric(18,2) not null default 0,
  net_amount numeric(18,2) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  unique (report_id, member_ref)
);

create index if not exists income_division_reports_org_competence_idx on public.income_division_reports(organization_id, competence desc);
create index if not exists income_division_report_items_report_idx on public.income_division_report_items(report_id);

alter table public.income_division_reports enable row level security;
alter table public.income_division_report_items enable row level security;

drop policy if exists "income reports manager read" on public.income_division_reports;
create policy "income reports manager read" on public.income_division_reports
  for select using (public.is_org_member(organization_id, 'manager'));
drop policy if exists "income reports member sent read" on public.income_division_reports;
create policy "income reports member sent read" on public.income_division_reports
  for select using (status = 'sent' and public.is_org_member(organization_id));
drop policy if exists "income reports manager write" on public.income_division_reports;
create policy "income reports manager write" on public.income_division_reports
  for all using (public.is_org_member(organization_id, 'manager')) with check (public.is_org_member(organization_id, 'manager'));

drop policy if exists "income report items manager read" on public.income_division_report_items;
create policy "income report items manager read" on public.income_division_report_items
  for select using (public.is_org_member(organization_id, 'manager'));
drop policy if exists "income report items member sent read" on public.income_division_report_items;
create policy "income report items member sent read" on public.income_division_report_items
  for select using (
    public.is_org_member(organization_id)
    and exists (select 1 from public.income_division_reports r where r.id = report_id and r.status = 'sent')
    and member_user_id = auth.uid()
  );
drop policy if exists "income report items manager write" on public.income_division_report_items;
create policy "income report items manager write" on public.income_division_report_items
  for all using (public.is_org_member(organization_id, 'manager')) with check (public.is_org_member(organization_id, 'manager'));

create or replace function public.list_member_income_reports(
  target_org uuid,
  target_member_user uuid default null,
  target_member_contact uuid default null
)
returns table (
  report_id uuid,
  competence date,
  monthly_target numeric,
  sent_at timestamptz,
  item_id uuid,
  member_ref text,
  member_name text,
  personal_expenses numeric,
  holding_expenses numeric,
  total_expenses numeric,
  net_amount numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_org_member(target_org) then raise exception 'not_authorized'; end if;
  if not public.is_org_member(target_org, 'manager') then
    target_member_user := auth.uid();
    target_member_contact := null;
  elsif target_member_user is null and target_member_contact is null then
    target_member_user := auth.uid();
  end if;

  return query
    select r.id, r.competence, r.monthly_target, r.sent_at,
      i.id, i.member_ref, i.member_name, i.personal_expenses,
      i.holding_expenses, i.total_expenses, i.net_amount
    from public.income_division_reports r
    join public.income_division_report_items i on i.report_id = r.id
    where r.organization_id = target_org
      and r.status = 'sent'
      and ((target_member_user is not null and i.member_user_id = target_member_user)
        or (target_member_contact is not null and i.member_contact_id = target_member_contact))
    order by r.competence desc;
end;
$$;

revoke all on function public.list_member_income_reports(uuid, uuid, uuid) from public, anon;
grant execute on function public.list_member_income_reports(uuid, uuid, uuid) to authenticated;

drop trigger if exists income_division_reports_updated_at on public.income_division_reports;
create trigger income_division_reports_updated_at before update on public.income_division_reports
  for each row execute procedure public.set_updated_at();

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'income_division_reports') then
    alter publication supabase_realtime add table public.income_division_reports;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'income_division_report_items') then
    alter publication supabase_realtime add table public.income_division_report_items;
  end if;
end $$;
