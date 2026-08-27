-- Keep contact-member dashboard income consistent with its detailed expenses.
-- Contacts without login use the same proportional holding rule as members.
create or replace function public.get_contact_member_portfolio(target_org uuid, target_member_contact uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  viewer_ownership numeric := 0;
  ownership_total numeric := 0;
  member_weight numeric := 0;
  member_monthly_expenses numeric := 0;
  settings public.member_visibility_settings%rowtype;
  result jsonb;
begin
  if not public.is_org_member(target_org, 'manager') then
    raise exception 'not_authorized';
  end if;

  select coalesce(oc.ownership_percentage, 0)
    into viewer_ownership
    from public.organization_contacts oc
   where oc.id = target_member_contact
     and oc.organization_id = target_org;
  if not found then raise exception 'member_contact_not_found'; end if;

  select coalesce(sum(owner.ownership_percentage), 0)
    into ownership_total
    from (
      select coalesce(om.ownership_percentage, 0) as ownership_percentage
        from public.organization_members om
       where om.organization_id = target_org
      union all
      select coalesce(oc.ownership_percentage, 0)
        from public.organization_contacts oc
       where oc.organization_id = target_org
    ) owner;
  member_weight := case when ownership_total > 0 then viewer_ownership / ownership_total else 0 end;

  -- Recurring expenses are always part of the current monthly view;
  -- one-time expenses count only in the current month.
  select coalesce(sum(
    case
      when exists (
        select 1 from public.expense_responsibilities er
         where er.organization_id = target_org and er.expense_id = e.id
      ) then coalesce((
        select sum(er.share_percentage)
          from public.expense_responsibilities er
         where er.organization_id = target_org
           and er.expense_id = e.id
           and er.contact_id = target_member_contact
      ), 0) * e.value / 100
      when e.responsible_contact_id = target_member_contact then e.value
      when e.responsible_user_id is not null or e.responsible_contact_id is not null then 0
      else e.value * member_weight
    end
  ), 0)
    into member_monthly_expenses
    from public.expenses e
   where e.organization_id = target_org
     and (
       coalesce(e.expense_kind, 'recurring') <> 'one_time'
       or (
         e.expense_date >= date_trunc('month', current_date)::date
         and e.expense_date < (date_trunc('month', current_date) + interval '1 month')::date
       )
     );

  select * into settings
    from public.member_visibility_settings mvs
   where mvs.organization_id = target_org;
  if not found then
    settings.show_total_assets := true;
    settings.show_property_values := true;
    settings.show_rental_info := true;
    settings.show_property_status := true;
    settings.show_photos := true;
    settings.show_locations := true;
    settings.show_map := true;
    settings.show_documents := true;
    settings.show_ownership_by_beneficiary := false;
  end if;

  with monthly_unit_rents as (
    select
      u.id as unit_id,
      u.building_id,
      coalesce((
        select l.current_rent
          from public.leases l
         where l.organization_id = target_org
           and l.unit_id = u.id
           and l.status in ('active', 'ending')
         order by l.updated_at desc
         limit 1
      ), u.potential_rent, 0) as gross_rent
      from public.property_units u
     where u.organization_id = target_org
  ), unit_rows as (
    select u.building_id,
      jsonb_build_object(
        'id', u.id,
        'code', u.code,
        'type', u.unit_type,
        'quantity', u.quantity,
        'status', case when settings.show_property_status then u.status::text else null end,
        'rent', case when settings.show_rental_info then round(r.gross_rent * member_weight, 2) else 0 end
      ) as item
      from public.property_units u
      join monthly_unit_rents r on r.unit_id = u.id
     where u.organization_id = target_org
  ), units_by_building as (
    select building_id, jsonb_agg(item order by item ->> 'code') as items
      from unit_rows group by building_id
  ), building_rows as (
    select jsonb_build_object(
      'id', coalesce(b.source_key, b.id::text),
      'db_id', b.id,
      'asset_id', a.id,
      'source_key', b.source_key,
      'name', a.name,
      'description', b.description,
      'address', case when settings.show_locations then b.address else '' end,
      'city', case when settings.show_locations or settings.show_map then b.city else '' end,
      'state', case when settings.show_locations or settings.show_map then b.state else '' end,
      'postal_code', case when settings.show_locations then b.postal_code else null end,
      'latitude', case when settings.show_map then b.latitude else null end,
      'longitude', case when settings.show_map then b.longitude else null end,
      'value', case when settings.show_property_values then round(b.current_value * member_weight, 2) else 0 end,
      'status', case when settings.show_property_status then b.status::text else null end,
      'total_units', b.total_units,
      'units', coalesce(ub.items, '[]'::jsonb)
    ) as item
      from public.buildings b
      join public.assets a on a.id = b.asset_id and a.organization_id = target_org
      left join units_by_building ub on ub.building_id = b.id
     where b.organization_id = target_org and b.status <> 'sold'
  )
  select jsonb_build_object(
    'settings', jsonb_build_object(
      'showTotalAssets', settings.show_total_assets,
      'showPropertyValues', settings.show_property_values,
      'showRentalInfo', settings.show_rental_info,
      'showPropertyStatus', settings.show_property_status,
      'showPhotos', settings.show_photos,
      'showLocations', settings.show_locations,
      'showMap', settings.show_map,
      'showDocuments', settings.show_documents,
      'showOwnershipByBeneficiary', settings.show_ownership_by_beneficiary
    ),
    'summary', jsonb_build_object(
      'totalValue', case when settings.show_total_assets then coalesce((select sum(round(current_value * member_weight, 2)) from public.buildings where organization_id = target_org and status <> 'sold'), 0) else 0 end,
      'holdingTotalValue', coalesce((select sum(current_value) from public.buildings where organization_id = target_org and status <> 'sold'), 0),
      'totalBuildings', (select count(*) from public.buildings where organization_id = target_org and status <> 'sold'),
      'totalUnits', coalesce((select sum(u.quantity) from public.property_units u join public.buildings b on b.id = u.building_id where u.organization_id = target_org and b.status <> 'sold'), 0),
      'grossRent', case when settings.show_rental_info then coalesce((select sum(round(gross_rent * member_weight, 2)) from monthly_unit_rents r join public.buildings b on b.id = r.building_id where b.status <> 'sold'), 0) else 0 end,
      'totalRent', case when settings.show_rental_info then coalesce((select sum(round(gross_rent * member_weight, 2)) from monthly_unit_rents r join public.buildings b on b.id = r.building_id where b.status <> 'sold'), 0) - member_monthly_expenses else 0 end,
      'monthlyExpenses', case when settings.show_rental_info then member_monthly_expenses else 0 end,
      'ownershipPercentage', viewer_ownership
    ),
    'buildings', coalesce((select jsonb_agg(item order by item ->> 'name') from building_rows), '[]'::jsonb),
    'ownership', '[]'::jsonb
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_contact_member_portfolio(uuid, uuid) from public, anon;
grant execute on function public.get_contact_member_portfolio(uuid, uuid) to authenticated;
