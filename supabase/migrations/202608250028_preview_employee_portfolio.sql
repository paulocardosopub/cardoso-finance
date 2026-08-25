-- Permitir pré-visualização operacional para a gestão.
create or replace function public.get_employee_portfolio(target_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare employee_membership_role public.member_role; result jsonb;
begin
  select m.role into employee_membership_role from public.organization_members m where m.organization_id = target_org and m.user_id = auth.uid();
  if employee_membership_role is null then raise exception 'not_authorized'; end if;
  if employee_membership_role not in ('owner','admin','manager','employee') then raise exception 'employee_endpoint_only'; end if;
  with unit_rows as (
    select u.building_id,
      jsonb_build_object(
        'id', u.id, 'code', u.code, 'type', u.unit_type, 'quantity', u.quantity,
        'status', u.status::text, 'rent', coalesce(l.current_rent, u.potential_rent, 0),
        'tenantName', t.name,
        'lease', case when l.id is null then null else jsonb_build_object(
          'id', l.id, 'tenantId', l.tenant_id, 'tenantName', t.name,
          'currentRent', l.current_rent, 'dueDay', l.due_day, 'startDate', l.start_date,
          'endDate', l.end_date, 'status', l.status::text,
          'currentPaymentStatus', coalesce(p.status::text, 'pending'),
          'currentPaymentId', p.id
        ) end
      ) as item
    from public.property_units u
    left join lateral (
      select l.* from public.leases l
      where l.organization_id = target_org and l.unit_id = u.id and l.status in ('active','ending','draft')
      order by case when l.status = 'active' then 0 when l.status = 'ending' then 1 else 2 end, l.updated_at desc
      limit 1
    ) l on true
    left join public.tenants t on t.id = l.tenant_id
    left join public.lease_payments p on p.lease_id = l.id and p.competence = date_trunc('month', current_date)::date
    where u.organization_id = target_org
  ), units_by_building as (
    select building_id, jsonb_agg(item order by item ->> 'code') as units from unit_rows group by building_id
  ), buildings as (
    select jsonb_build_object(
      'id', coalesce(b.source_key, b.id::text), 'db_id', b.id, 'asset_id', b.asset_id,
      'name', a.name, 'description', b.description, 'address', b.address, 'city', b.city,
      'state', b.state, 'postal_code', b.postal_code, 'latitude', b.latitude, 'longitude', b.longitude,
      'status', b.status::text, 'total_units', b.total_units, 'units', coalesce(ub.units, '[]'::jsonb)
    ) as item
    from public.buildings b join public.assets a on a.id = b.asset_id and a.organization_id = target_org
    left join units_by_building ub on ub.building_id = b.id
    where b.organization_id = target_org and b.status <> 'sold'
  ), visits as (
    select jsonb_agg(jsonb_build_object(
      'id', v.id, 'buildingId', v.building_id, 'unitId', v.unit_id,
      'buildingName', a.name, 'unitCode', u.code, 'visitedAt', v.visited_at,
      'latitude', v.latitude, 'longitude', v.longitude, 'notes', v.notes
    ) order by v.visited_at desc) as items
    from public.property_visits v
    join public.buildings b on b.id = v.building_id
    join public.assets a on a.id = b.asset_id
    left join public.property_units u on u.id = v.unit_id
    where v.organization_id = target_org
      and v.visited_at >= timezone('utc', now()) - interval '90 days'
  )
  select jsonb_build_object(
    'buildings', coalesce((select jsonb_agg(item order by item ->> 'name') from buildings), '[]'::jsonb),
    'visits', coalesce((select items from visits), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_employee_portfolio(uuid) from public, anon;
grant execute on function public.get_employee_portfolio(uuid) to authenticated;
