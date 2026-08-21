-- A importação da planilha é exclusiva da holding real Cardoso.
create or replace function public.seed_cardoso_portfolio(target_org uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  source_org uuid;
  source_asset record;
  source_building record;
  source_unit record;
  new_asset uuid;
  new_building uuid;
  created_units integer := 0;
begin
  if auth.uid() <> '9d03f18a-4cfc-4543-89d6-b6b23a613fdd'::uuid then
    raise exception 'not_authorized';
  end if;
  if not public.is_org_member(target_org, 'owner') then
    raise exception 'target_organization_not_owned';
  end if;
  if not exists (
    select 1 from public.organizations
    where id = target_org and owner_id = auth.uid() and name = 'Cardoso'
  ) then
    raise exception 'cardoso_only';
  end if;

  select id into source_org
  from public.organizations
  where owner_id = auth.uid() and name = 'Cardoso'
  order by created_at
  limit 1;
  if source_org is null or source_org = target_org then return 0; end if;
  if exists (select 1 from public.assets where organization_id = target_org and source_key = 'casa-lago-sul') then return 0; end if;

  for source_asset in select * from public.assets where organization_id = source_org and source_key is not null loop
    insert into public.assets (organization_id, name, type, description, current_value, acquisition_value, status, source_key)
      values (target_org, source_asset.name, source_asset.type, source_asset.description, source_asset.current_value, null, source_asset.status, source_asset.source_key)
      returning id into new_asset;
    select * into source_building from public.buildings where organization_id = source_org and asset_id = source_asset.id limit 1;
    if source_building.id is not null then
      insert into public.buildings (asset_id, organization_id, address, city, state, total_units, current_value, acquisition_value, status, notes, source_key)
        values (new_asset, target_org, source_building.address, source_building.city, source_building.state, source_building.total_units, source_building.current_value, null, source_building.status, source_building.notes, source_building.source_key)
        returning id into new_building;
      for source_unit in select * from public.property_units where organization_id = source_org and building_id = source_building.id loop
        insert into public.property_units (building_id, organization_id, code, unit_type, area, estimated_value, potential_rent, status, notes, source_key, quantity)
          values (new_building, target_org, source_unit.code, source_unit.unit_type, source_unit.area, source_unit.estimated_value, source_unit.potential_rent, source_unit.status, source_unit.notes, source_unit.source_key, source_unit.quantity);
        created_units := created_units + 1;
      end loop;
    end if;
  end loop;
  return created_units;
end;
$$;

grant execute on function public.seed_cardoso_portfolio(uuid) to authenticated;
