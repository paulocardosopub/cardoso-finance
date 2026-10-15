-- Organization-wide publication of the fixed shared-property list shown to members.
create table if not exists public.division_member_shared_items (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid not null references public.property_units(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (organization_id, unit_id)
);

create index if not exists division_member_shared_items_org_idx on public.division_member_shared_items(organization_id);

alter table public.division_member_shared_items enable row level security;

drop policy if exists "division shared members read" on public.division_member_shared_items;
create policy "division shared members read" on public.division_member_shared_items
  for select using (public.is_org_member(organization_id));

drop policy if exists "division shared managers insert" on public.division_member_shared_items;
create policy "division shared managers insert" on public.division_member_shared_items
  for insert with check (public.is_org_member(organization_id, 'manager'));

drop policy if exists "division shared managers update" on public.division_member_shared_items;
create policy "division shared managers update" on public.division_member_shared_items
  for update using (public.is_org_member(organization_id, 'manager'))
  with check (public.is_org_member(organization_id, 'manager'));

drop policy if exists "division shared managers delete" on public.division_member_shared_items;
create policy "division shared managers delete" on public.division_member_shared_items
  for delete using (public.is_org_member(organization_id, 'manager'));

drop trigger if exists division_member_shared_items_updated_at on public.division_member_shared_items;
create trigger division_member_shared_items_updated_at before update on public.division_member_shared_items
  for each row execute procedure public.set_updated_at();

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'division_member_shared_items') then
    alter publication supabase_realtime add table public.division_member_shared_items;
  end if;
end $$;
