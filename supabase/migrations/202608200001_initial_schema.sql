create extension if not exists "pgcrypto";

create type public.organization_type as enum ('personal', 'family', 'company');
create type public.member_role as enum ('owner', 'admin', 'manager', 'viewer');
create type public.asset_type as enum ('property', 'investment', 'cash', 'vehicle', 'company_participation', 'other');
create type public.building_status as enum ('active', 'renovation', 'for_sale', 'sold', 'inactive');
create type public.unit_status as enum ('rented', 'vacant', 'maintenance', 'negotiation', 'for_sale', 'sold');
create type public.lease_status as enum ('draft', 'active', 'ending', 'expired', 'terminated');
create type public.payment_status as enum ('pending', 'paid', 'overdue', 'partial', 'waived');
create type public.invitation_status as enum ('pending', 'accepted', 'expired', 'cancelled');

create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = timezone('utc', now()); return new; end $$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '', avatar_url text, phone text,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now())
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(), name text not null, type public.organization_type not null,
  description text not null default '', logo_url text, currency char(3) not null default 'BRL', owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now())
);
create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'viewer', ownership_percentage numeric(7,4) not null default 0 check (ownership_percentage >= 0 and ownership_percentage <= 100),
  joined_at timestamptz not null default timezone('utc', now()), primary key (organization_id, user_id)
);
create table public.invitations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null, role public.member_role not null default 'viewer', ownership_percentage numeric(7,4) not null default 0,
  token text not null unique default encode(gen_random_bytes(24), 'hex'), status public.invitation_status not null default 'pending',
  expires_at timestamptz not null default (timezone('utc', now()) + interval '7 days'), invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default timezone('utc', now())
);
create table public.assets (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, type public.asset_type not null, description text not null default '', current_value numeric(18,2) not null default 0,
  acquisition_value numeric(18,2), acquisition_date date, status text not null default 'active', created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now())
);
create table public.buildings (
  id uuid primary key default gen_random_uuid(), asset_id uuid not null unique references public.assets(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade, address text not null default '', city text not null default '', state text not null default '', postal_code text,
  description text not null default '', total_units integer not null default 0 check (total_units >= 0), acquisition_date date, acquisition_value numeric(18,2), current_value numeric(18,2) not null default 0,
  last_valuation_date date, status public.building_status not null default 'active', cover_url text, notes text not null default '',
  created_by uuid references auth.users(id), created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now())
);
create table public.property_units (
  id uuid primary key default gen_random_uuid(), building_id uuid not null references public.buildings(id) on delete cascade, organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null, unit_type text not null default 'Apartamento', floor text, area numeric(10,2), bedrooms smallint, bathrooms smallint, parking_spaces smallint, registry_number text,
  estimated_value numeric(18,2) not null default 0, potential_rent numeric(18,2) not null default 0, status public.unit_status not null default 'vacant', notes text not null default '', created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()),
  unique(building_id, code)
);
create table public.properties (
  id uuid primary key default gen_random_uuid(), asset_id uuid not null unique references public.assets(id) on delete cascade, organization_id uuid not null references public.organizations(id) on delete cascade,
  address text not null default '', city text not null default '', state text not null default '', area numeric(10,2), potential_rent numeric(18,2) not null default 0, status public.unit_status not null default 'vacant', created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now())
);
create table public.tenants (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, name text not null, tenant_type text not null default 'individual', tax_id text, email text, phone text, notes text not null default '', created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now())
);
create table public.leases (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, unit_id uuid references public.property_units(id) on delete restrict, property_id uuid references public.properties(id) on delete restrict, tenant_id uuid not null references public.tenants(id) on delete restrict,
  start_date date not null, end_date date, initial_rent numeric(18,2) not null default 0, current_rent numeric(18,2) not null default 0, due_day smallint not null default 10 check (due_day between 1 and 31), adjustment_index text, adjustment_period text, next_adjustment date, guarantee_type text, deposit_amount numeric(18,2), manager_name text, management_fee numeric(8,4), penalty numeric(8,4), notes text not null default '', status public.lease_status not null default 'draft', created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), check (unit_id is not null or property_id is not null)
);
create table public.lease_payments (
  id uuid primary key default gen_random_uuid(), lease_id uuid not null references public.leases(id) on delete cascade, organization_id uuid not null references public.organizations(id) on delete cascade, competence date not null, due_date date not null, expected_amount numeric(18,2) not null default 0, received_amount numeric(18,2) not null default 0, received_at date, discount numeric(18,2) not null default 0, fine numeric(18,2) not null default 0, interest numeric(18,2) not null default 0, management_fee numeric(18,2) not null default 0, other_discounts numeric(18,2) not null default 0, net_amount numeric(18,2) generated always as (received_amount + fine + interest - discount - management_fee - other_discounts) stored, status public.payment_status not null default 'pending', notes text not null default '', created_at timestamptz not null default timezone('utc', now()), unique(lease_id, competence)
);
create table public.valuations (
  id uuid primary key default gen_random_uuid(), asset_id uuid not null references public.assets(id) on delete cascade, organization_id uuid not null references public.organizations(id) on delete cascade, value numeric(18,2) not null, valuation_date date not null, responsible text, source text, notes text not null default '', created_by uuid references auth.users(id), created_at timestamptz not null default timezone('utc', now())
);
create table public.revenues (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, asset_id uuid references public.assets(id) on delete set null, value numeric(18,2) not null, revenue_date date not null, competence date, category text not null default 'other', description text not null, origin text, notes text not null default '', created_by uuid references auth.users(id), created_at timestamptz not null default timezone('utc', now())
);
create table public.expenses (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, asset_id uuid references public.assets(id) on delete set null, building_id uuid references public.buildings(id) on delete set null, unit_id uuid references public.property_units(id) on delete set null, description text not null, category text not null default 'other', value numeric(18,2) not null, expense_date date not null, competence date, recurring boolean not null default false, supplier text, responsible text, receipt_path text, notes text not null default '', created_by uuid references auth.users(id), created_at timestamptz not null default timezone('utc', now())
);
create table public.sales (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, asset_id uuid not null references public.assets(id) on delete restrict, acquisition_value numeric(18,2), sale_price numeric(18,2) not null, costs numeric(18,2) not null default 0, taxes numeric(18,2) not null default 0, result numeric(18,2) generated always as (sale_price - coalesce(acquisition_value, 0) - costs - taxes) stored, sale_date date not null, buyer text, notes text not null default '', created_at timestamptz not null default timezone('utc', now())
);
create table public.distributions (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, distribution_date date not null, description text not null, total_value numeric(18,2) not null, status text not null default 'draft', created_by uuid references auth.users(id), created_at timestamptz not null default timezone('utc', now())
);
create table public.distribution_items (
  id uuid primary key default gen_random_uuid(), distribution_id uuid not null references public.distributions(id) on delete cascade, organization_id uuid not null references public.organizations(id) on delete cascade, user_id uuid not null references auth.users(id) on delete restrict, percentage numeric(7,4), value numeric(18,2) not null, payment_status text not null default 'pending', paid_at date
);
create table public.documents (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, asset_id uuid references public.assets(id) on delete cascade, building_id uuid references public.buildings(id) on delete cascade, unit_id uuid references public.property_units(id) on delete cascade, name text not null, category text not null default 'other', storage_path text not null, mime_type text, size_bytes bigint, uploaded_by uuid references auth.users(id), created_at timestamptz not null default timezone('utc', now())
);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id) on delete set null, user_id uuid references auth.users(id) on delete set null, entity_type text not null, entity_id uuid, action text not null, old_values jsonb, new_values jsonb, created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.is_org_member(org_id uuid, required_role public.member_role default null) returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.organization_members m where m.organization_id = org_id and m.user_id = auth.uid() and (required_role is null or case required_role when 'owner' then m.role = 'owner' when 'admin' then m.role in ('owner','admin') when 'manager' then m.role in ('owner','admin','manager') else true end));
$$;
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$ begin insert into public.profiles(id, full_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', '')); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
create or replace function public.create_organization(org_name text, org_type public.organization_type, org_description text default '', org_currency char(3) default 'BRL') returns uuid language plpgsql security definer set search_path = public as $$ declare new_id uuid; begin if auth.uid() is null then raise exception 'not_authenticated'; end if; insert into public.organizations(name,type,description,currency,owner_id) values(org_name,org_type,org_description,org_currency,auth.uid()) returning id into new_id; insert into public.organization_members(organization_id,user_id,role,ownership_percentage) values(new_id,auth.uid(),'owner',100); return new_id; end $$;

do $$ declare t text; begin foreach t in array array['profiles','organizations','organization_members','invitations','assets','buildings','property_units','properties','tenants','leases','lease_payments','valuations','revenues','expenses','sales','distributions','distribution_items','documents','audit_logs'] loop execute format('alter table public.%I enable row level security', t); end loop; end $$;
create policy "profiles self read" on public.profiles for select using (id = auth.uid());
create policy "profiles self update" on public.profiles for update using (id = auth.uid());
create policy "organizations members read" on public.organizations for select using (public.is_org_member(id));
create policy "organizations owner create" on public.organizations for insert with check (owner_id = auth.uid());
create policy "organizations admins update" on public.organizations for update using (public.is_org_member(id, 'admin'));
create policy "organizations owner delete" on public.organizations for delete using (owner_id = auth.uid());
create policy "members read" on public.organization_members for select using (public.is_org_member(organization_id));
create policy "members admin manage" on public.organization_members for all using (public.is_org_member(organization_id, 'admin')) with check (public.is_org_member(organization_id, 'admin'));
create policy "members own insert" on public.organization_members for insert with check (user_id = auth.uid() and public.is_org_member(organization_id, 'owner'));
create policy "invitations member read" on public.invitations for select using (public.is_org_member(organization_id));
create policy "invitations admin manage" on public.invitations for all using (public.is_org_member(organization_id, 'admin')) with check (public.is_org_member(organization_id, 'admin'));
create policy "invitations recipient read" on public.invitations for select using (lower(email) = lower(coalesce((select email from auth.users where id = auth.uid()), '')));

do $$ declare t text; begin foreach t in array array['assets','buildings','property_units','properties','tenants','leases','lease_payments','valuations','revenues','expenses','sales','distributions','distribution_items','documents','audit_logs'] loop execute format('create policy "%s member read" on public.%I for select using (public.is_org_member(organization_id))', t, t); execute format('create policy "%s manager write" on public.%I for insert with check (public.is_org_member(organization_id, ''manager''))', t, t); execute format('create policy "%s manager update" on public.%I for update using (public.is_org_member(organization_id, ''manager'')) with check (public.is_org_member(organization_id, ''manager''))', t, t); execute format('create policy "%s admin delete" on public.%I for delete using (public.is_org_member(organization_id, ''admin''))', t, t); end loop; end $$;
create policy "storage organization read" on storage.objects for select using (bucket_id = 'organization-documents' and public.is_org_member((storage.foldername(name))[1]::uuid));
create policy "storage organization upload" on storage.objects for insert with check (bucket_id = 'organization-documents' and public.is_org_member((storage.foldername(name))[1]::uuid, 'manager'));
create policy "storage organization delete" on storage.objects for delete using (bucket_id = 'organization-documents' and public.is_org_member((storage.foldername(name))[1]::uuid, 'admin'));
insert into storage.buckets (id, name, public) values ('organization-documents', 'organization-documents', false) on conflict (id) do nothing;

create index organizations_owner_idx on public.organizations(owner_id);
create index members_user_idx on public.organization_members(user_id);
create index assets_org_idx on public.assets(organization_id);
create index units_building_idx on public.property_units(building_id);
create index leases_org_status_idx on public.leases(organization_id, status);
create index payments_org_competence_idx on public.lease_payments(organization_id, competence);
create index audit_org_created_idx on public.audit_logs(organization_id, created_at desc);

create trigger profiles_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
create trigger organizations_updated_at before update on public.organizations for each row execute procedure public.set_updated_at();
create trigger assets_updated_at before update on public.assets for each row execute procedure public.set_updated_at();
create trigger buildings_updated_at before update on public.buildings for each row execute procedure public.set_updated_at();
create trigger units_updated_at before update on public.property_units for each row execute procedure public.set_updated_at();
create trigger properties_updated_at before update on public.properties for each row execute procedure public.set_updated_at();
create trigger tenants_updated_at before update on public.tenants for each row execute procedure public.set_updated_at();
create trigger leases_updated_at before update on public.leases for each row execute procedure public.set_updated_at();
