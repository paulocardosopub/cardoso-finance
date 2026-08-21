create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  name text not null default 'Conta principal',
  initial_balance numeric(18,2) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.distribution_items alter column user_id drop not null;
alter table public.distribution_items add column if not exists contact_id uuid references public.organization_contacts(id) on delete restrict;
alter table public.distribution_items drop constraint if exists distribution_items_recipient_check;
alter table public.distribution_items add constraint distribution_items_recipient_check check ((user_id is not null) <> (contact_id is not null));

alter table public.bank_accounts enable row level security;
drop policy if exists "bank accounts member read" on public.bank_accounts;
drop policy if exists "bank accounts manager write" on public.bank_accounts;
drop policy if exists "bank accounts manager update" on public.bank_accounts;
drop policy if exists "bank accounts admin delete" on public.bank_accounts;
create policy "bank accounts member read" on public.bank_accounts for select using (public.is_org_member(organization_id));
create policy "bank accounts manager write" on public.bank_accounts for insert with check (public.is_org_member(organization_id, 'manager'));
create policy "bank accounts manager update" on public.bank_accounts for update using (public.is_org_member(organization_id, 'manager')) with check (public.is_org_member(organization_id, 'manager'));
create policy "bank accounts admin delete" on public.bank_accounts for delete using (public.is_org_member(organization_id, 'admin'));

drop policy if exists "distribution items manager update" on public.distribution_items;
create policy "distribution items manager update" on public.distribution_items for update using (public.is_org_member(organization_id, 'manager')) with check (public.is_org_member(organization_id, 'manager'));

create trigger bank_accounts_updated_at before update on public.bank_accounts for each row execute procedure public.set_updated_at();
create index if not exists bank_accounts_org_idx on public.bank_accounts(organization_id);
