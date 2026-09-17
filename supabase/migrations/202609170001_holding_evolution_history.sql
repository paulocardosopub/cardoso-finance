-- Evolução patrimonial e operacional por unidade, com histórico auditável.
-- Snapshots retroativos usam apenas dados comprovados (created_at/status/valor atuais).

create table if not exists public.unit_evolution_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  building_id uuid references public.buildings(id) on delete set null,
  unit_id uuid references public.property_units(id) on delete set null,
  lease_id uuid references public.leases(id) on delete set null,
  event_type text not null,
  occurred_at timestamptz not null default timezone('utc', now()),
  created_by uuid references auth.users(id) on delete set null,
  old_status text,
  new_status text,
  old_rent numeric(18,2),
  new_rent numeric(18,2),
  old_tenant_id uuid references public.tenants(id) on delete set null,
  new_tenant_id uuid references public.tenants(id) on delete set null,
  old_tenant_name text,
  new_tenant_name text,
  monthly_impact numeric(18,2) not null default 0,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists unit_evolution_org_date_idx on public.unit_evolution_history(organization_id, occurred_at desc);
create index if not exists unit_evolution_unit_date_idx on public.unit_evolution_history(unit_id, occurred_at desc);
create index if not exists unit_evolution_event_idx on public.unit_evolution_history(organization_id, event_type, occurred_at desc);
alter table public.unit_evolution_history enable row level security;
do $$ begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='unit_evolution_history') then
    execute 'alter publication supabase_realtime add table public.unit_evolution_history';
  end if;
exception when undefined_object then null;
end $$;
drop policy if exists "unit evolution member read" on public.unit_evolution_history;
create policy "unit evolution member read" on public.unit_evolution_history for select using (public.is_org_member(organization_id));
revoke all on public.unit_evolution_history from anon;
grant select on public.unit_evolution_history to authenticated;

-- Backfill comprovável: um snapshot no momento em que cada registro foi criado.
insert into public.unit_evolution_history (organization_id, building_id, unit_id, event_type, occurred_at, old_status, new_status, old_rent, new_rent, monthly_impact, metadata)
select u.organization_id, u.building_id, u.id, 'unit_snapshot', u.created_at, null, u.status::text, null, u.potential_rent,
       case when u.status::text in ('rented','for_sale') then coalesce(u.potential_rent,0) * greatest(coalesce(u.quantity,1),1) else 0 end,
       jsonb_build_object('source','property_units.created_at','snapshot',true)
from public.property_units u
where not exists (select 1 from public.unit_evolution_history h where h.unit_id=u.id and h.event_type='unit_snapshot');

insert into public.unit_evolution_history (organization_id, building_id, unit_id, lease_id, event_type, occurred_at, old_status, new_status, old_rent, new_rent, old_tenant_id, new_tenant_id, new_tenant_name, monthly_impact, metadata)
select l.organization_id, u.building_id, l.unit_id, l.id, 'lease_snapshot', l.created_at, null,
       case when l.status::text in ('active','ending') then 'rented' when l.status::text in ('terminated','expired') then 'vacant' else null end,
       null, l.current_rent, null, l.tenant_id, t.name,
       case when l.status::text in ('active','ending') then coalesce(l.current_rent,0) else 0 end,
       jsonb_build_object('source','leases.created_at','snapshot',true,'lease_status',l.status::text)
from public.leases l
left join public.property_units u on u.id=l.unit_id
left join public.tenants t on t.id=l.tenant_id
where l.unit_id is not null
  and not exists (select 1 from public.unit_evolution_history h where h.lease_id=l.id and h.event_type='lease_snapshot');

create or replace function public.evolution_status_from_lease(value text)
returns text language sql immutable as $$
  select case when value in ('active','ending') then 'rented' when value in ('terminated','expired') then 'vacant' else null end
$$;

create or replace function public.record_unit_evolution_history()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  old_status_text text;
  new_status_text text;
  old_rent_value numeric;
  new_rent_value numeric;
  impact numeric;
  qty numeric;
begin
  if tg_op = 'INSERT' then
    qty := greatest(coalesce(new.quantity,1),1);
    insert into public.unit_evolution_history (organization_id, building_id, unit_id, event_type, occurred_at, created_by, new_status, new_rent, monthly_impact, metadata)
    values (new.organization_id, new.building_id, new.id, 'unit_created', timezone('utc', now()), auth.uid(), new.status::text, new.potential_rent,
      case when new.status::text in ('rented','for_sale') then coalesce(new.potential_rent,0)*qty else 0 end,
      jsonb_build_object('code',new.code,'quantity',new.quantity));
    return new;
  elsif tg_op = 'DELETE' then
    qty := greatest(coalesce(old.quantity,1),1);
    insert into public.unit_evolution_history (organization_id, building_id, unit_id, event_type, occurred_at, created_by, old_status, old_rent, monthly_impact, metadata)
    values (old.organization_id, old.building_id, old.id, 'unit_deleted', timezone('utc', now()), auth.uid(), old.status::text, old.potential_rent,
      case when old.status::text in ('rented','for_sale') then -coalesce(old.potential_rent,0)*qty else 0 end,
      jsonb_build_object('code',old.code,'quantity',old.quantity));
    return old;
  end if;

  old_status_text := old.status::text;
  new_status_text := new.status::text;
  old_rent_value := coalesce(old.potential_rent,0);
  new_rent_value := coalesce(new.potential_rent,0);
  qty := greatest(coalesce(new.quantity,1),1);
  if old_status_text is distinct from new_status_text then
    impact := (case when new_status_text in ('rented','for_sale') then new_rent_value*qty else 0 end)
            - (case when old_status_text in ('rented','for_sale') then old_rent_value*greatest(coalesce(old.quantity,1),1) else 0 end);
    insert into public.unit_evolution_history (organization_id, building_id, unit_id, event_type, occurred_at, created_by, old_status, new_status, old_rent, new_rent, monthly_impact, metadata)
    values (new.organization_id, new.building_id, new.id, 'status_changed', timezone('utc', now()), auth.uid(), old_status_text, new_status_text, old.potential_rent, new.potential_rent, impact, jsonb_build_object('code',new.code));
  end if;
  if old.potential_rent is distinct from new.potential_rent then
    insert into public.unit_evolution_history (organization_id, building_id, unit_id, event_type, occurred_at, created_by, old_status, new_status, old_rent, new_rent, monthly_impact, metadata)
    values (new.organization_id, new.building_id, new.id, 'rent_changed', timezone('utc', now()), auth.uid(), old_status_text, new_status_text, old.potential_rent, new.potential_rent,
      case when new_status_text in ('rented','for_sale') then (new_rent_value-old_rent_value)*qty else 0 end, jsonb_build_object('code',new.code));
  end if;
  return new;
end;
$$;

create or replace function public.record_lease_evolution_history()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  unit_row public.property_units%rowtype;
  old_tenant_name text;
  new_tenant_name text;
  old_status_text text;
  new_status_text text;
  old_rent_value numeric;
  new_rent_value numeric;
  impact numeric;
  event_org uuid;
  event_unit uuid;
  event_building uuid;
  event_lease uuid;
  event_tenant uuid;
begin
  if tg_op = 'DELETE' then
    event_org := old.organization_id; event_unit := old.unit_id; event_lease := old.id; event_tenant := old.tenant_id;
    old_status_text := public.evolution_status_from_lease(old.status::text);
    old_rent_value := coalesce(old.current_rent,0);
    select u.building_id into event_building from public.property_units u where u.id=old.unit_id;
    select t.name into old_tenant_name from public.tenants t where t.id=old.tenant_id;
    insert into public.unit_evolution_history (organization_id, building_id, unit_id, lease_id, event_type, occurred_at, created_by, old_status, old_rent, old_tenant_id, old_tenant_name, monthly_impact, metadata)
    values (event_org,event_building,event_unit,event_lease,'lease_deleted',timezone('utc',now()),auth.uid(),old_status_text,old.current_rent,old.tenant_id,old_tenant_name,
      case when old_status_text='rented' then -old_rent_value else 0 end,jsonb_build_object('lease_status',old.status::text));
    return old;
  end if;

  event_org := new.organization_id; event_unit := new.unit_id; event_lease := new.id; event_tenant := new.tenant_id;
  select u.building_id into event_building from public.property_units u where u.id=new.unit_id;
  select t.name into new_tenant_name from public.tenants t where t.id=new.tenant_id;
  if tg_op = 'INSERT' then
    new_status_text := public.evolution_status_from_lease(new.status::text);
    insert into public.unit_evolution_history (organization_id,building_id,unit_id,lease_id,event_type,occurred_at,created_by,new_status,new_rent,new_tenant_id,new_tenant_name,monthly_impact,metadata)
    values (event_org,event_building,event_unit,event_lease,'lease_created',timezone('utc',now()),auth.uid(),new_status_text,new.current_rent,new.tenant_id,new_tenant_name,
      case when new_status_text='rented' then coalesce(new.current_rent,0) else 0 end,jsonb_build_object('lease_status',new.status::text));
    return new;
  end if;

  old_status_text := public.evolution_status_from_lease(old.status::text);
  new_status_text := public.evolution_status_from_lease(new.status::text);
  old_rent_value := coalesce(old.current_rent,0); new_rent_value := coalesce(new.current_rent,0);
  select t.name into old_tenant_name from public.tenants t where t.id=old.tenant_id;
  if old.status is distinct from new.status then
    impact := (case when new_status_text='rented' then new_rent_value else 0 end) - (case when old_status_text='rented' then old_rent_value else 0 end);
    insert into public.unit_evolution_history (organization_id,building_id,unit_id,lease_id,event_type,occurred_at,created_by,old_status,new_status,old_rent,new_rent,old_tenant_id,new_tenant_id,old_tenant_name,new_tenant_name,monthly_impact,metadata)
    values(event_org,event_building,event_unit,event_lease,'lease_status_changed',timezone('utc',now()),auth.uid(),old_status_text,new_status_text,old.current_rent,new.current_rent,old.tenant_id,new.tenant_id,old_tenant_name,new_tenant_name,impact,jsonb_build_object('lease_status_before',old.status::text,'lease_status_after',new.status::text));
  end if;
  if old.current_rent is distinct from new.current_rent then
    insert into public.unit_evolution_history (organization_id,building_id,unit_id,lease_id,event_type,occurred_at,created_by,old_status,new_status,old_rent,new_rent,monthly_impact,metadata)
    values(event_org,event_building,event_unit,event_lease,'rent_changed',timezone('utc',now()),auth.uid(),old_status_text,new_status_text,old.current_rent,new.current_rent,
      case when coalesce(new_status_text,old_status_text)='rented' then new_rent_value-old_rent_value else 0 end,jsonb_build_object('source','lease.current_rent'));
  end if;
  if old.tenant_id is distinct from new.tenant_id then
    insert into public.unit_evolution_history (organization_id,building_id,unit_id,lease_id,event_type,occurred_at,created_by,old_tenant_id,new_tenant_id,old_tenant_name,new_tenant_name,metadata)
    values(event_org,event_building,event_unit,event_lease,'tenant_changed',timezone('utc',now()),auth.uid(),old.tenant_id,new.tenant_id,old_tenant_name,new_tenant_name,jsonb_build_object('lease_status',new.status::text));
  end if;
  return new;
end;
$$;

drop trigger if exists unit_evolution_history_trigger on public.property_units;
create trigger unit_evolution_history_trigger after insert or update or delete on public.property_units for each row execute procedure public.record_unit_evolution_history();
drop trigger if exists lease_evolution_history_trigger on public.leases;
create trigger lease_evolution_history_trigger after insert or update or delete on public.leases for each row execute procedure public.record_lease_evolution_history();

create or replace function public.get_holding_evolution(target_org uuid, target_start_month date default null, target_month_count integer default 6)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  first_month date;
  count_months integer := greatest(1, least(coalesce(target_month_count,6), 12));
  month_values jsonb;
  event_values jsonb;
  is_manager boolean;
begin
  if not public.is_org_member(target_org) then raise exception 'not_authorized'; end if;
  first_month := coalesce(date_trunc('month', target_start_month)::date, (date_trunc('month', current_date)::date - ((count_months-1) * interval '1 month'))::date);
  is_manager := public.is_org_member(target_org, 'manager');

  select coalesce(jsonb_agg(jsonb_build_object('month',m.month,'totalUnits',m.total_units,'occupiedUnits',m.occupied_units,'vacantUnits',m.vacant_units,'occupancyRate',m.occupancy_rate,'monthlyIncome',m.monthly_income,'newRentalIncome',m.new_rental_income,'rentAdjustmentIncome',m.rent_adjustment_income,'incomeChangePercent',m.income_change_percent) order by m.month_start), '[]'::jsonb)
    into month_values
  from (
    with month_series as (
      select generate_series(first_month, first_month + ((count_months-1) * interval '1 month'), interval '1 month')::date as month_start
    ), unit_base as (
      select u.id,u.organization_id,u.building_id,u.quantity,u.status::text as fallback_status,coalesce(u.potential_rent,0) as fallback_rent
      from public.property_units u where u.organization_id=target_org
    ), monthly_values as (
      select ms.month_start,
        coalesce(sum(coalesce(u.quantity,1)),0)::integer as total_units,
        coalesce(sum(coalesce(u.quantity,1)) filter (where coalesce(status_state.value,u.fallback_status) in ('rented','for_sale')),0)::integer as occupied_units,
        coalesce(sum(case when coalesce(status_state.value,u.fallback_status) not in ('rented','for_sale') then coalesce(u.quantity,1) else 0 end),0)::integer as vacant_units,
        case when ms.month_start < date '2026-08-01' then 0::numeric else coalesce(sum(case when coalesce(status_state.value,u.fallback_status) in ('rented','for_sale') then coalesce(rent_state.value,u.fallback_rent) * coalesce(u.quantity,1) else 0 end),0)::numeric(18,2) end as monthly_income
      from month_series ms cross join unit_base u
      left join lateral (select h.new_status as value from public.unit_evolution_history h where h.organization_id=target_org and h.unit_id=u.id and h.new_status is not null and h.occurred_at < (ms.month_start + interval '1 month') order by h.occurred_at desc,h.id desc limit 1) status_state on true
      left join lateral (select h.new_rent as value from public.unit_evolution_history h where h.organization_id=target_org and h.unit_id=u.id and h.new_rent is not null and h.occurred_at < (ms.month_start + interval '1 month') order by h.occurred_at desc,h.id desc limit 1) rent_state on true
      group by ms.month_start
    ), monthly_enriched as (
      select mv.month_start,to_char(mv.month_start,'YYYY-MM') as month,mv.total_units,mv.occupied_units,mv.vacant_units,round(case when mv.total_units=0 then 0 else mv.occupied_units::numeric/mv.total_units*100 end,2) as occupancy_rate,mv.monthly_income,
        case when mv.month_start < date '2026-08-01' then 0::numeric else coalesce((select sum(h.monthly_impact) from public.unit_evolution_history h where h.organization_id=target_org and h.occurred_at >= mv.month_start and h.occurred_at < mv.month_start + interval '1 month' and h.event_type in ('lease_created','status_changed','lease_status_changed') and h.monthly_impact > 0),0)::numeric(18,2) end as new_rental_income,
        case when mv.month_start < date '2026-08-01' then 0::numeric else coalesce((select sum(h.monthly_impact) from public.unit_evolution_history h where h.organization_id=target_org and h.occurred_at >= mv.month_start and h.occurred_at < mv.month_start + interval '1 month' and h.event_type='rent_changed' and h.monthly_impact > 0),0)::numeric(18,2) end as rent_adjustment_income
      from monthly_values mv
    )
    select e.*,coalesce(round((e.monthly_income - lag(e.monthly_income) over (order by e.month_start)) / nullif(abs(lag(e.monthly_income) over (order by e.month_start)),0) * 100, 2),0) as income_change_percent
    from monthly_enriched e
  ) m;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id',h.id,'eventType',h.event_type,'occurredAt',h.occurred_at,'buildingName',coalesce(a.name,'Imóvel'),'unitCode',u.code,
      'oldStatus',h.old_status,'newStatus',h.new_status,'oldRent',h.old_rent,'newRent',h.new_rent,'oldTenantName',h.old_tenant_name,'newTenantName',h.new_tenant_name,
      'monthlyImpact',h.monthly_impact,'responsibleName',case when is_manager then p.full_name else null end
    ) order by h.occurred_at desc), '[]'::jsonb)
    into event_values
  from public.unit_evolution_history h
  left join public.property_units u on u.id=h.unit_id
  left join public.buildings b on b.id=h.building_id
  left join public.assets a on a.id=b.asset_id
  left join public.profiles p on p.id=h.created_by
  where h.organization_id=target_org and h.occurred_at >= first_month and h.occurred_at < first_month + (count_months * interval '1 month') and h.event_type in ('unit_created','unit_deleted','status_changed','rent_changed','lease_created','lease_deleted','lease_status_changed','tenant_changed');

  return jsonb_build_object('months',month_values,'events',event_values,'startMonth',first_month,'monthCount',count_months,'rentalStartMonth','2026-08-01');
end;
$$;
revoke all on function public.get_holding_evolution(uuid,date,integer) from public, anon;
grant execute on function public.get_holding_evolution(uuid,date,integer) to authenticated;
