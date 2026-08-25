-- Member-facing monthly rent values must represent only the authenticated
-- member's entitlement in the selected organization.

create or replace function public.get_member_portfolio(target_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  viewer_role public.member_role;
  viewer_ownership numeric(7,4) := 0;
  ownership_total numeric := 0;
  member_weight numeric := 0;
  member_monthly_expenses numeric := 0;
  settings public.member_visibility_settings%rowtype;
  result jsonb;
begin
  select role, coalesce(ownership_percentage, 0)
  into viewer_role, viewer_ownership
  from public.organization_members
  where organization_id = target_org and user_id = auth.uid();
  if viewer_role is null then raise exception 'not_authorized'; end if;
  if viewer_role <> 'viewer' then raise exception 'member_endpoint_only'; end if;

  select coalesce(sum(ownership_percentage), 0)
  into ownership_total
  from (
    select ownership_percentage from public.organization_members where organization_id = target_org
    union all
    select ownership_percentage from public.organization_contacts where organization_id = target_org
  ) members;
  member_weight := case when ownership_total > 0 then viewer_ownership / ownership_total else 0 end;

  select coalesce(sum(
    case
      when exists (
        select 1 from public.expense_responsibilities er
        where er.expense_id = e.id and er.organization_id = target_org
      ) then coalesce((
        select sum(er.share_percentage)
        from public.expense_responsibilities er
        where er.expense_id = e.id
          and er.organization_id = target_org
          and er.user_id = auth.uid()
      ), 0) * e.value / 100
      when e.responsible_user_id = auth.uid() then e.value
      when e.responsible_user_id is not null or e.responsible_contact_id is not null then 0
      else e.value * member_weight
    end
  ), 0)
  into member_monthly_expenses
  from public.expenses e
  where e.organization_id = target_org
    and (coalesce(e.expense_kind, 'recurring') <> 'one_time'
      or e.expense_date >= date_trunc('month', current_date)::date
      and e.expense_date < (date_trunc('month', current_date) + interval '1 month')::date);

  select * into settings from public.member_visibility_settings where organization_id = target_org;
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
          and l.start_date <= (date_trunc('month', current_date) + interval '1 month - 1 day')::date
          and (l.end_date is null or l.end_date >= date_trunc('month', current_date)::date)
        order by l.updated_at desc
        limit 1
      ), u.potential_rent, 0) as gross_rent
    from public.property_units u
    where u.organization_id = target_org
  ), unit_rows as (
    select
      u.building_id,
      jsonb_build_object(
        'id', u.id,
        'code', u.code,
        'type', u.unit_type,
        'quantity', u.quantity,
        'status', case when settings.show_property_status then u.status::text else null end,
        'rent', case when settings.show_rental_info
          then round(r.gross_rent * member_weight, 2)
          else 0
        end
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
      'value', case when settings.show_property_values then b.current_value else 0 end,
      'status', case when settings.show_property_status then b.status::text else null end,
      'total_units', b.total_units,
      'units', coalesce(ub.items, '[]'::jsonb)
    ) as item
    from public.buildings b
    join public.assets a on a.id = b.asset_id and a.organization_id = target_org
    left join units_by_building ub on ub.building_id = b.id
    where b.organization_id = target_org and b.status <> 'sold'
  ), ownership_rows as (
    select coalesce(nullif(p.full_name, ''), split_part(u.email, '@', 1), 'Membro') as name,
           m.ownership_percentage as percentage, m.joined_at
    from public.organization_members m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.id = m.user_id
    where m.organization_id = target_org
    union all
    select c.full_name, c.ownership_percentage, c.created_at
    from public.organization_contacts c where c.organization_id = target_org
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
      'totalValue', case when settings.show_total_assets then coalesce((select sum(current_value) from public.buildings where organization_id = target_org and status <> 'sold'), 0) else 0 end,
      'totalBuildings', (select count(*) from public.buildings where organization_id = target_org and status <> 'sold'),
      'totalUnits', (select coalesce(sum(u.quantity), 0) from public.property_units u join public.buildings b on b.id = u.building_id where u.organization_id = target_org and b.status <> 'sold'),
      'grossRent', case when settings.show_rental_info then coalesce((
        select sum(round(r.gross_rent * member_weight, 2))
        from monthly_unit_rents r
        join public.buildings b on b.id = r.building_id
        where b.status <> 'sold'
      ), 0) else 0 end,
      'totalRent', case when settings.show_rental_info then coalesce((
        select sum(round(r.gross_rent * member_weight, 2))
        from monthly_unit_rents r
        join public.buildings b on b.id = r.building_id
        where b.status <> 'sold'
      ), 0) - member_monthly_expenses else 0 end,
      'monthlyExpenses', case when settings.show_rental_info then member_monthly_expenses else 0 end,
      'ownershipPercentage', viewer_ownership
    ),
    'buildings', coalesce((select jsonb_agg(item order by item ->> 'name') from building_rows), '[]'::jsonb),
    'ownership', case when settings.show_ownership_by_beneficiary then coalesce((select jsonb_agg(jsonb_build_object('name', name, 'percentage', percentage) order by joined_at) from ownership_rows), '[]'::jsonb) else '[]'::jsonb end
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_member_portfolio(uuid) from public, anon;
grant execute on function public.get_member_portfolio(uuid) to authenticated;
