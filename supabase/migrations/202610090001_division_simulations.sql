-- Planning-only patrimonial division scenarios. These tables never change the
-- source property, building, lease or ownership records.
create table if not exists public.division_simulations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  notes text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.division_simulation_items (
  id uuid primary key default gen_random_uuid(),
  simulation_id uuid not null references public.division_simulations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.property_units(id) on delete set null,
  assignment text not null check (assignment in ('paulo', 'pedro', 'aurora', 'carlos', 'shared')),
  unit_code text not null,
  building_name text not null,
  value_snapshot numeric(18,2) not null default 0,
  rent_snapshot numeric(18,2) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(simulation_id, unit_id)
);

create index if not exists division_simulations_org_idx on public.division_simulations(organization_id, updated_at desc);
create index if not exists division_simulation_items_simulation_idx on public.division_simulation_items(simulation_id);

alter table public.division_simulations enable row level security;
alter table public.division_simulation_items enable row level security;

drop policy if exists "division simulations manager read" on public.division_simulations;
create policy "division simulations manager read" on public.division_simulations
  for select using (public.is_org_member(organization_id, 'manager'));
drop policy if exists "division simulations manager insert" on public.division_simulations;
create policy "division simulations manager insert" on public.division_simulations
  for insert with check (public.is_org_member(organization_id, 'manager'));
drop policy if exists "division simulations manager update" on public.division_simulations;
create policy "division simulations manager update" on public.division_simulations
  for update using (public.is_org_member(organization_id, 'manager'))
  with check (public.is_org_member(organization_id, 'manager'));
drop policy if exists "division simulations manager delete" on public.division_simulations;
create policy "division simulations manager delete" on public.division_simulations
  for delete using (public.is_org_member(organization_id, 'manager'));

drop policy if exists "division items manager read" on public.division_simulation_items;
create policy "division items manager read" on public.division_simulation_items
  for select using (public.is_org_member(organization_id, 'manager'));
drop policy if exists "division items manager insert" on public.division_simulation_items;
create policy "division items manager insert" on public.division_simulation_items
  for insert with check (public.is_org_member(organization_id, 'manager'));
drop policy if exists "division items manager update" on public.division_simulation_items;
create policy "division items manager update" on public.division_simulation_items
  for update using (public.is_org_member(organization_id, 'manager'))
  with check (public.is_org_member(organization_id, 'manager'));
drop policy if exists "division items manager delete" on public.division_simulation_items;
create policy "division items manager delete" on public.division_simulation_items
  for delete using (public.is_org_member(organization_id, 'manager'));

create or replace function public.validate_division_item() returns trigger
language plpgsql security definer set search_path = public as $$
declare simulation_org uuid; unit_org uuid;
begin
  select organization_id into simulation_org from public.division_simulations where id = new.simulation_id;
  if simulation_org is null or simulation_org <> new.organization_id then
    raise exception 'division_simulation_organization_mismatch';
  end if;
  if new.unit_id is not null then
    select organization_id into unit_org from public.property_units where id = new.unit_id;
    if unit_org is null or unit_org <> new.organization_id then
      raise exception 'division_unit_organization_mismatch';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_division_item_before_write on public.division_simulation_items;
create trigger validate_division_item_before_write
  before insert or update on public.division_simulation_items
  for each row execute procedure public.validate_division_item();

drop trigger if exists division_simulations_updated_at on public.division_simulations;
create trigger division_simulations_updated_at before update on public.division_simulations
  for each row execute procedure public.set_updated_at();
drop trigger if exists division_simulation_items_updated_at on public.division_simulation_items;
create trigger division_simulation_items_updated_at before update on public.division_simulation_items
  for each row execute procedure public.set_updated_at();
