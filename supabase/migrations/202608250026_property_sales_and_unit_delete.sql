-- Operações administrativas: excluir unidades e registrar vendas com crédito.

alter table public.revenues
  add column if not exists source_sale_id uuid references public.sales(id) on delete cascade;
create unique index if not exists revenues_source_sale_idx
  on public.revenues(source_sale_id) where source_sale_id is not null;

create or replace function public.delete_property_unit(target_org uuid, target_unit uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare unit_row public.property_units%rowtype; lease_ids uuid[];
begin
  if not public.is_org_member(target_org, 'manager') then raise exception 'not_authorized'; end if;
  select u.* into unit_row from public.property_units u where u.id = target_unit and u.organization_id = target_org for update;
  if unit_row.id is null then raise exception 'unit_not_found'; end if;
  select coalesce(array_agg(l.id), '{}'::uuid[]) into lease_ids from public.leases l where l.organization_id = target_org and l.unit_id = target_unit;
  delete from public.notifications where organization_id = target_org and entity_type = 'lease' and entity_id = any(lease_ids);
  delete from public.leases where organization_id = target_org and unit_id = target_unit;
  delete from public.expenses where organization_id = target_org and unit_id = target_unit;
  delete from public.property_visits where organization_id = target_org and unit_id = target_unit;
  delete from public.documents where organization_id = target_org and unit_id = target_unit;
  delete from public.property_units where id = target_unit and organization_id = target_org;
  return jsonb_build_object('unitId', target_unit, 'deleted', true);
end;
$$;
revoke all on function public.delete_property_unit(uuid, uuid) from public, anon;
grant execute on function public.delete_property_unit(uuid, uuid) to authenticated;

create or replace function public.record_property_sale(target_org uuid, target_building uuid, sale_price numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare building_row public.buildings%rowtype; asset_row public.assets%rowtype; sale_id uuid; revenue_id uuid;
begin
  if not public.is_org_member(target_org, 'manager') then raise exception 'not_authorized'; end if;
  if sale_price is null or sale_price <= 0 then raise exception 'invalid_sale_price'; end if;
  select b.* into building_row from public.buildings b where b.id = target_building and b.organization_id = target_org for update;
  if building_row.id is null then raise exception 'building_not_found'; end if;
  if building_row.status = 'sold' then raise exception 'already_sold'; end if;
  select a.* into asset_row from public.assets a where a.id = building_row.asset_id and a.organization_id = target_org for update;
  if asset_row.id is null then raise exception 'asset_not_found'; end if;
  insert into public.sales(organization_id, asset_id, acquisition_value, sale_price, sale_date, notes)
  values(target_org, asset_row.id, coalesce(building_row.acquisition_value, asset_row.acquisition_value), sale_price, current_date, 'Venda confirmada pela gestão')
  returning id into sale_id;
  insert into public.revenues(organization_id, asset_id, value, revenue_date, competence, category, description, origin, notes, created_by, source_sale_id)
  values(target_org, asset_row.id, sale_price, current_date, date_trunc('month', current_date)::date, 'sale', 'Venda · ' || asset_row.name, 'property_sale', 'Crédito criado automaticamente pela venda do imóvel', auth.uid(), sale_id)
  returning id into revenue_id;
  update public.leases set status = 'terminated', end_date = current_date, updated_at = timezone('utc', now()) where organization_id = target_org and unit_id in (select id from public.property_units where building_id = target_building);
  update public.property_units set status = 'sold', updated_at = timezone('utc', now()) where organization_id = target_org and building_id = target_building;
  update public.buildings set status = 'sold', current_value = sale_price, updated_at = timezone('utc', now()) where id = target_building and organization_id = target_org;
  update public.assets set status = 'sold', current_value = sale_price, updated_at = timezone('utc', now()) where id = asset_row.id and organization_id = target_org;
  return jsonb_build_object('saleId', sale_id, 'revenueId', revenue_id, 'buildingId', target_building, 'amount', sale_price);
end;
$$;
revoke all on function public.record_property_sale(uuid, uuid, numeric) from public, anon;
grant execute on function public.record_property_sale(uuid, uuid, numeric) to authenticated;
