-- Corrige o estado histórico para unidades criadas ou alugadas após cada mês.
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

  select coalesce(jsonb_agg(jsonb_build_object('month',m.month,'totalUnits',m.total_units,'occupiedUnits',m.occupied_units,'vacantUnits',m.vacant_units,'occupancyRate',m.occupancy_rate,'monthlyIncome',m.monthly_income,'newRentals',m.new_rentals,'vacatedUnits',m.vacated_units,'newRentalIncome',m.new_rental_income,'rentAdjustmentIncome',m.rent_adjustment_income,'incomeChangePercent',m.income_change_percent) order by m.month_start), '[]'::jsonb)
    into month_values
  from (
    with month_series as (
      select generate_series(first_month, first_month + ((count_months-1) * interval '1 month'), interval '1 month')::date as month_start
    ), unit_base as (
      select u.id,u.organization_id,u.building_id,u.quantity,u.created_at,u.status::text as fallback_status,coalesce(u.potential_rent,0) as fallback_rent
      from public.property_units u where u.organization_id=target_org
    ), monthly_values as (
      select ms.month_start,
        coalesce(sum(coalesce(u.quantity,1)) filter (where u.created_at < (ms.month_start + interval '1 month')),0)::integer as total_units,
        coalesce(sum(coalesce(u.quantity,1)) filter (where u.created_at < (ms.month_start + interval '1 month') and coalesce(status_state.value,u.fallback_status) in ('rented','for_sale')),0)::integer as occupied_units,
        coalesce(sum(case when u.created_at < (ms.month_start + interval '1 month') and coalesce(status_state.value,u.fallback_status) not in ('rented','for_sale') then coalesce(u.quantity,1) else 0 end),0)::integer as vacant_units,
        case when ms.month_start < date '2026-08-01' then 0::numeric else coalesce(sum(case when u.created_at < (ms.month_start + interval '1 month') and coalesce(status_state.value,u.fallback_status) in ('rented','for_sale') then coalesce(rent_state.value,u.fallback_rent) * coalesce(u.quantity,1) else 0 end),0)::numeric(18,2) end as monthly_income
      from month_series ms cross join unit_base u
      left join lateral (select h.new_status as value from public.unit_evolution_history h where h.organization_id=target_org and h.unit_id=u.id and h.new_status is not null and h.occurred_at < (ms.month_start + interval '1 month') order by h.occurred_at desc,h.id desc limit 1) status_state on true
      left join lateral (select h.new_rent as value from public.unit_evolution_history h where h.organization_id=target_org and h.unit_id=u.id and h.new_rent is not null and h.occurred_at < (ms.month_start + interval '1 month') order by h.occurred_at desc,h.id desc limit 1) rent_state on true
      group by ms.month_start
    ), monthly_enriched as (
      select mv.month_start,to_char(mv.month_start,'YYYY-MM') as month,mv.total_units,mv.occupied_units,mv.vacant_units,round(case when mv.total_units=0 then 0 else mv.occupied_units::numeric/mv.total_units*100 end,2) as occupancy_rate,mv.monthly_income,
        case when mv.month_start < date '2026-08-01' then 0 else coalesce((select sum(coalesce((h.metadata->>'quantity')::numeric,1)) from public.unit_evolution_history h where h.organization_id=target_org and h.occurred_at >= mv.month_start and h.occurred_at < mv.month_start + interval '1 month' and h.event_type in ('lease_created','status_changed','lease_status_changed') and h.new_status='rented' and h.monthly_impact > 0 and (h.event_type <> 'lease_created' or not exists (select 1 from public.unit_evolution_history d where d.organization_id=h.organization_id and d.unit_id=h.unit_id and d.event_type='status_changed' and d.new_status='rented' and d.occurred_at between h.occurred_at - interval '1 second' and h.occurred_at + interval '1 second'))),0)::integer end as new_rentals,
        case when mv.month_start < date '2026-08-01' then 0 else coalesce((select sum(coalesce((h.metadata->>'quantity')::numeric,1)) from public.unit_evolution_history h where h.organization_id=target_org and h.occurred_at >= mv.month_start and h.occurred_at < mv.month_start + interval '1 month' and h.event_type in ('status_changed','lease_status_changed') and h.new_status='vacant' and h.old_status='rented'),0)::integer end as vacated_units,
        case when mv.month_start < date '2026-08-01' then 0::numeric else coalesce((select sum(h.monthly_impact) from public.unit_evolution_history h where h.organization_id=target_org and h.occurred_at >= mv.month_start and h.occurred_at < mv.month_start + interval '1 month' and h.event_type in ('lease_created','status_changed','lease_status_changed') and h.new_status='rented' and h.monthly_impact > 0 and (h.event_type <> 'lease_created' or not exists (select 1 from public.unit_evolution_history d where d.organization_id=h.organization_id and d.unit_id=h.unit_id and d.event_type='status_changed' and d.new_status='rented' and d.occurred_at between h.occurred_at - interval '1 second' and h.occurred_at + interval '1 second'))),0)::numeric(18,2) end as new_rental_income,
        case when mv.month_start < date '2026-08-01' then 0::numeric else coalesce((select sum(h.monthly_impact) from public.unit_evolution_history h where h.organization_id=target_org and h.occurred_at >= mv.month_start and h.occurred_at < mv.month_start + interval '1 month' and h.event_type='rent_changed' and h.monthly_impact > 0),0)::numeric(18,2) end as rent_adjustment_income
      from monthly_values mv
    )
    select e.*,coalesce(round((e.monthly_income - lag(e.monthly_income) over (order by e.month_start)) / nullif(abs(lag(e.monthly_income) over (order by e.month_start)),0) * 100, 2),0) as income_change_percent
    from monthly_enriched e
  ) m;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id',h.id,'eventType',h.event_type,'occurredAt',h.occurred_at,'buildingName',coalesce(a.name,'Imóvel'),'unitCode',coalesce(u.code,h.metadata->>'code'),
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
