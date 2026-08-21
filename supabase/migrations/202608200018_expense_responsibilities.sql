create table if not exists public.expense_responsibilities (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  contact_id uuid references public.organization_contacts(id) on delete cascade,
  share_percentage numeric(7,4) not null default 0 check (share_percentage >= 0 and share_percentage <= 100),
  created_at timestamptz not null default timezone('utc', now()),
  check ((user_id is not null) <> (contact_id is not null))
);

create unique index if not exists expense_responsibilities_user_idx on public.expense_responsibilities(expense_id, user_id) where user_id is not null;
create unique index if not exists expense_responsibilities_contact_idx on public.expense_responsibilities(expense_id, contact_id) where contact_id is not null;
create index if not exists expense_responsibilities_org_idx on public.expense_responsibilities(organization_id);
alter table public.expense_responsibilities enable row level security;
drop policy if exists "expense responsibilities member read" on public.expense_responsibilities;
drop policy if exists "expense responsibilities manager write" on public.expense_responsibilities;
create policy "expense responsibilities member read" on public.expense_responsibilities for select using (public.is_org_member(organization_id));
create policy "expense responsibilities manager write" on public.expense_responsibilities for all using (public.is_org_member(organization_id, 'manager')) with check (public.is_org_member(organization_id, 'manager'));

insert into public.expense_responsibilities (expense_id, organization_id, user_id, share_percentage)
select id, organization_id, responsible_user_id, 100
from public.expenses
where responsible_user_id is not null
on conflict do nothing;

insert into public.expense_responsibilities (expense_id, organization_id, contact_id, share_percentage)
select id, organization_id, responsible_contact_id, 100
from public.expenses
where responsible_contact_id is not null
on conflict do nothing;
