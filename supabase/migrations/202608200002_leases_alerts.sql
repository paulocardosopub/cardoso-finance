-- Contratos, histórico de reajustes e alertas internos.
-- Compatível com os registros existentes: os novos campos são opcionais para dados legados.

alter table public.assets add column if not exists source_key text;
alter table public.buildings add column if not exists source_key text;
alter table public.property_units add column if not exists source_key text;
alter table public.property_units add column if not exists quantity integer not null default 1 check (quantity > 0);
alter table public.leases add column if not exists adjustment_frequency text not null default 'annual';
alter table public.leases add column if not exists contract_document_url text;

create unique index if not exists assets_org_source_key_idx on public.assets(organization_id, source_key) where source_key is not null;
create unique index if not exists units_org_source_key_idx on public.property_units(organization_id, source_key) where source_key is not null;
create index if not exists leases_unit_status_idx on public.leases(unit_id, status);
create index if not exists leases_next_adjustment_idx on public.leases(organization_id, next_adjustment);

create table if not exists public.lease_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lease_id uuid not null references public.leases(id) on delete cascade,
  previous_rent numeric(18,2) not null,
  new_rent numeric(18,2) not null,
  adjustment_date date not null,
  percentage numeric(10,4),
  index_name text,
  notes text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  type text not null check (type in ('lease_ending', 'rent_adjustment', 'general')),
  title text not null,
  message text not null,
  entity_type text,
  entity_id uuid,
  due_date date not null,
  read_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'read', 'dismissed')),
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists notifications_dedupe_idx on public.notifications(organization_id, type, entity_id, due_date);
create index if not exists notifications_org_due_idx on public.notifications(organization_id, due_date, status);

alter table public.lease_adjustments enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "lease adjustments member read" on public.lease_adjustments;
drop policy if exists "lease adjustments manager write" on public.lease_adjustments;
drop policy if exists "lease adjustments admin delete" on public.lease_adjustments;
create policy "lease adjustments member read" on public.lease_adjustments for select using (public.is_org_member(organization_id));
create policy "lease adjustments manager write" on public.lease_adjustments for insert with check (public.is_org_member(organization_id, 'manager'));
create policy "lease adjustments admin delete" on public.lease_adjustments for delete using (public.is_org_member(organization_id, 'admin'));

drop policy if exists "notifications member read" on public.notifications;
drop policy if exists "notifications manager write" on public.notifications;
drop policy if exists "notifications member update" on public.notifications;
create policy "notifications member read" on public.notifications for select using (public.is_org_member(organization_id));
create policy "notifications manager write" on public.notifications for insert with check (public.is_org_member(organization_id, 'manager'));
create policy "notifications member update" on public.notifications for update using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

create or replace function public.refresh_lease_notifications(target_org uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare created_count integer := 0; inserted_count integer := 0;
begin
  if not public.is_org_member(target_org) then raise exception 'not_authorized'; end if;

  insert into public.notifications (organization_id, user_id, type, title, message, entity_type, entity_id, due_date)
  select l.organization_id, auth.uid(), 'lease_ending', 'Contrato chegando ao fim',
    coalesce(u.code, 'Unidade') || ' · término em ' || to_char(l.end_date, 'DD/MM/YYYY'), 'lease', l.id, alert_date
  from public.leases l
  left join public.property_units u on u.id = l.unit_id
  cross join lateral unnest(array[l.end_date - interval '90 days', l.end_date - interval '60 days', l.end_date - interval '30 days']) alert_date
  where l.organization_id = target_org and l.end_date is not null and l.status in ('active', 'ending')
    and alert_date::date >= current_date and alert_date::date <= current_date + 90
  on conflict (organization_id, type, entity_id, due_date) do nothing;
  get diagnostics inserted_count = row_count;
  created_count := created_count + inserted_count;

  insert into public.notifications (organization_id, user_id, type, title, message, entity_type, entity_id, due_date)
  select l.organization_id, auth.uid(), 'rent_adjustment', 'Reajuste próximo',
    coalesce(u.code, 'Unidade') || ' · reajuste em ' || to_char(l.next_adjustment, 'DD/MM/YYYY'), 'lease', l.id, alert_date
  from public.leases l
  left join public.property_units u on u.id = l.unit_id
  cross join lateral unnest(array[l.next_adjustment - interval '30 days', l.next_adjustment]) alert_date
  where l.organization_id = target_org and l.next_adjustment is not null and l.status = 'active'
    and alert_date::date >= current_date and alert_date::date <= current_date + 60
  on conflict (organization_id, type, entity_id, due_date) do nothing;
  get diagnostics inserted_count = row_count;
  created_count := created_count + inserted_count;
  return created_count;
end;
$$;

grant execute on function public.refresh_lease_notifications(uuid) to authenticated;
