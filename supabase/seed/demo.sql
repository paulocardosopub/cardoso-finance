-- Execute after creating a demo user in Supabase Auth.
-- Replace the UUID below with auth.users.id for that demo account.
do $$
declare demo_user uuid := '00000000-0000-0000-0000-000000000001'; org_id uuid; asset_id uuid; building_id uuid;
begin
  if not exists (select 1 from auth.users where id = demo_user) then raise notice 'Demo user not found; seed skipped. Create a user and replace demo_user first.'; return; end if;
  insert into public.organizations (name, type, description, currency, owner_id) values ('Cardoso Participações', 'company', 'Holding patrimonial familiar', 'BRL', demo_user) returning id into org_id;
  insert into public.organization_members (organization_id, user_id, role, ownership_percentage) values (org_id, demo_user, 'owner', 100);
  insert into public.assets (organization_id, name, type, current_value, acquisition_value, acquisition_date, created_by) values (org_id, 'Edifício Cardoso', 'property', 18500000, 14200000, '2021-05-20', demo_user) returning id into asset_id;
  insert into public.buildings (asset_id, organization_id, address, city, state, total_units, current_value, last_valuation_date, created_by) values (asset_id, org_id, 'Rua Harmonia, 128', 'São Paulo', 'SP', 22, 18500000, current_date, demo_user) returning id into building_id;
  insert into public.property_units (building_id, organization_id, code, unit_type, area, estimated_value, potential_rent, status) select building_id, org_id, '1' || lpad(i::text, 2, '0'), 'Apartamento', case when i <= 4 then 68 else 90 end, case when i <= 4 then 680000 else 900000 end, case when i <= 4 then 8500 else 11800 end, case when i in (3,4) then 'vacant'::public.unit_status else 'rented'::public.unit_status end from generate_series(1,22) i;
  insert into public.valuations (asset_id, organization_id, value, valuation_date, responsible, source, created_by) values (asset_id, org_id, 18000000, '2025-08-20', 'Cardoso Finance', 'Laudo interno', demo_user), (asset_id, org_id, 18500000, current_date, 'Cardoso Finance', 'Avaliação patrimonial', demo_user);
end $$;
