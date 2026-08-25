-- Funcionária: operational property-management role without ownership or financial dashboards.
alter table public.revenues add column if not exists source_payment_id uuid references public.lease_payments(id) on delete cascade;
create unique index if not exists revenues_source_payment_idx on public.revenues(source_payment_id) where source_payment_id is not null;

-- Keep the operational rent in both tables synchronized, regardless of whether
-- the change was made from the employee panel or by a manager.
create or replace function public.sync_property_unit_rent_from_lease()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.unit_id is not null and pg_trigger_depth() <= 1 then
    update public.property_units
       set potential_rent = new.current_rent,
           updated_at = timezone('utc', now())
     where id = new.unit_id and organization_id = new.organization_id;
  end if;
  return new;
end;
$$;
drop trigger if exists leases_sync_unit_rent on public.leases;
create trigger leases_sync_unit_rent
after insert or update of current_rent on public.leases
for each row execute function public.sync_property_unit_rent_from_lease();

create or replace function public.can_operate_properties(target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = auth.uid()
      and m.role in ('owner','admin','manager','employee')
  );
$$;
revoke all on function public.can_operate_properties(uuid) from public, anon;
grant execute on function public.can_operate_properties(uuid) to authenticated;

create table if not exists public.property_visits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  building_id uuid not null references public.buildings(id) on delete cascade,
  unit_id uuid references public.property_units(id) on delete set null,
  visited_by uuid not null references auth.users(id) on delete restrict,
  visited_at timestamptz not null default timezone('utc', now()),
  latitude numeric(10,7), longitude numeric(10,7), notes text not null default '',
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists property_visits_org_date_idx on public.property_visits(organization_id, visited_at desc);
alter table public.property_visits enable row level security;
create or replace function public.get_employee_portfolio(target_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare employee_membership_role public.member_role; result jsonb;
begin
  select m.role into employee_membership_role from public.organization_members m where m.organization_id = target_org and m.user_id = auth.uid();
  if employee_membership_role is null then raise exception 'not_authorized'; end if;
  if employee_membership_role <> 'employee' then raise exception 'employee_endpoint_only'; end if;
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

create table if not exists public.property_visits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  building_id uuid not null references public.buildings(id) on delete cascade,
  unit_id uuid references public.property_units(id) on delete set null,
  visited_by uuid not null references auth.users(id) on delete restrict,
  visited_at timestamptz not null default timezone('utc', now()),
  latitude numeric(10,7), longitude numeric(10,7), notes text not null default '',
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists property_visits_org_date_idx on public.property_visits(organization_id, visited_at desc);
alter table public.property_visits enable row level security;
drop policy if exists "property visits employee read" on public.property_visits;
drop policy if exists "property visits employee insert" on public.property_visits;
create policy "property visits employee read" on public.property_visits for select using (public.can_operate_properties(organization_id));
create policy "property visits employee insert" on public.property_visits for insert with check (public.can_operate_properties(organization_id) and visited_by = auth.uid());

create or replace function public.update_employee_unit(
  target_org uuid, target_unit uuid, unit_status text, rental_value numeric, tenant_name text, due_day integer default 10
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare unit_org uuid; existing_lease public.leases%rowtype; new_tenant_id uuid; normalized_name text; result jsonb;
begin
  if not public.can_operate_properties(target_org) then raise exception 'not_authorized'; end if;
  select organization_id into unit_org from public.property_units where id = target_unit;
  if unit_org is null or unit_org <> target_org then raise exception 'unit_not_found'; end if;
  if unit_status not in ('rented','vacant','maintenance','service','negotiation','for_sale') then raise exception 'invalid_status'; end if;
  if rental_value is null or rental_value < 0 then raise exception 'invalid_rent'; end if;
  normalized_name := nullif(trim(coalesce(tenant_name, '')), '');
  update public.property_units set status = unit_status::public.unit_status, potential_rent = rental_value, updated_at = timezone('utc', now()) where id = target_unit and organization_id = target_org;
  select l.* into existing_lease from public.leases l where l.organization_id = target_org and l.unit_id = target_unit and l.status in ('active','ending','draft') order by case when l.status='active' then 0 else 1 end, l.updated_at desc limit 1;
  if unit_status in ('rented','for_sale') and normalized_name is not null then
    select id into new_tenant_id from public.tenants where organization_id = target_org and lower(name) = lower(normalized_name) limit 1;
    if new_tenant_id is null then insert into public.tenants(organization_id, name) values(target_org, normalized_name) returning id into new_tenant_id; end if;
    if existing_lease.id is null then
      insert into public.leases(organization_id, unit_id, tenant_id, start_date, initial_rent, current_rent, due_day, status, notes)
      values(target_org, target_unit, new_tenant_id, current_date, rental_value, rental_value, greatest(1, least(31, coalesce(due_day, 10))), 'active', 'Atualizado pela Funcionária') returning * into existing_lease;
    else
      update public.leases set tenant_id = new_tenant_id, current_rent = rental_value, due_day = greatest(1, least(31, coalesce(due_day, 10))), status = 'active', updated_at = timezone('utc', now()) where id = existing_lease.id and organization_id = target_org returning * into existing_lease;
    end if;
  elsif existing_lease.id is not null then
    update public.leases set status = 'terminated', updated_at = timezone('utc', now()) where id = existing_lease.id and organization_id = target_org;
  end if;
  select jsonb_build_object('unitId', target_unit, 'status', unit_status, 'rent', rental_value, 'tenantName', normalized_name) into result;
  return result;
end;
$$;
revoke all on function public.update_employee_unit(uuid, uuid, text, numeric, text, integer) from public, anon;
grant execute on function public.update_employee_unit(uuid, uuid, text, numeric, text, integer) to authenticated;

create or replace function public.toggle_lease_payment(target_org uuid, target_lease uuid, target_competence date, mark_paid boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare lease_row public.leases%rowtype; payment_row public.lease_payments%rowtype; payment_id uuid; asset_id uuid; tenant_name text; competence_date date := date_trunc('month', target_competence)::date; expected numeric;
begin
  if not public.can_operate_properties(target_org) then raise exception 'not_authorized'; end if;
  select l.* into lease_row from public.leases l where l.id = target_lease and l.organization_id = target_org and l.status in ('active','ending');
  if lease_row.id is null then raise exception 'lease_not_found'; end if;
  expected := greatest(0, lease_row.current_rent);
  select p.* into payment_row from public.lease_payments p where p.lease_id = target_lease and p.competence = competence_date for update;
  if payment_row.id is null then
    insert into public.lease_payments(lease_id, organization_id, competence, due_date, expected_amount, received_amount, received_at, status, notes)
    values(target_lease, target_org, competence_date, competence_date + greatest(0, least(30, lease_row.due_day - 1)), expected, case when mark_paid then expected else 0 end, case when mark_paid then current_date else null end, (case when mark_paid then 'paid' else 'pending' end)::public.payment_status, 'Confirmação operacional') returning * into payment_row;
  else
    update public.lease_payments set expected_amount = expected, received_amount = case when mark_paid then expected else 0 end, received_at = case when mark_paid then coalesce(received_at, current_date) else null end, status = (case when mark_paid then 'paid' else 'pending' end)::public.payment_status, updated_at = timezone('utc', now()) where id = payment_row.id returning * into payment_row;
  end if;
  if mark_paid then
    select b.asset_id, t.name into asset_id, tenant_name from public.buildings b join public.property_units u on u.building_id=b.id left join public.tenants t on t.id=lease_row.tenant_id where u.id=lease_row.unit_id;
    insert into public.revenues(organization_id, asset_id, value, revenue_date, competence, category, description, origin, notes, created_by, source_payment_id)
    values(target_org, asset_id, expected, current_date, competence_date, 'rent', 'Aluguel · ' || coalesce(tenant_name, 'Unidade'), 'lease_payment', 'Criado pela confirmação do pagamento', auth.uid(), payment_row.id)
    on conflict (source_payment_id) where source_payment_id is not null do update set value=excluded.value, revenue_date=excluded.revenue_date, competence=excluded.competence, description=excluded.description, notes=excluded.notes;
  else
    delete from public.revenues where source_payment_id = payment_row.id;
  end if;
  return jsonb_build_object('paymentId', payment_row.id, 'leaseId', target_lease, 'competence', competence_date, 'status', payment_row.status, 'amount', payment_row.received_amount, 'markedPaid', mark_paid);
end;
$$;
revoke all on function public.toggle_lease_payment(uuid, uuid, date, boolean) from public, anon;
grant execute on function public.toggle_lease_payment(uuid, uuid, date, boolean) to authenticated;

-- Imported portfolios can have an occupied unit and a rent value before a
-- formal lease exists. Create the minimal operational lease on first payment
-- confirmation so the check works for those units too.
create or replace function public.toggle_unit_payment(target_org uuid, target_unit uuid, target_competence date, mark_paid boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare unit_row public.property_units%rowtype; lease_row public.leases%rowtype; tenant_id uuid;
begin
  if not public.can_operate_properties(target_org) then raise exception 'not_authorized'; end if;
  select u.* into unit_row from public.property_units u where u.id = target_unit and u.organization_id = target_org;
  if unit_row.id is null then raise exception 'unit_not_found'; end if;
  select l.* into lease_row from public.leases l where l.organization_id = target_org and l.unit_id = target_unit and l.status in ('active','ending') order by case when l.status='active' then 0 else 1 end, l.updated_at desc limit 1;
  if lease_row.id is null then
    if unit_row.status not in ('rented','for_sale') or coalesce(unit_row.potential_rent, 0) <= 0 then raise exception 'lease_not_found'; end if;
    select t.id into tenant_id from public.tenants t where t.organization_id = target_org and t.name = 'Inquilino não informado' limit 1;
    if tenant_id is null then insert into public.tenants(organization_id, name) values(target_org, 'Inquilino não informado') returning id into tenant_id; end if;
    insert into public.leases(organization_id, unit_id, tenant_id, start_date, initial_rent, current_rent, due_day, status, notes)
    values(target_org, target_unit, tenant_id, current_date, unit_row.potential_rent, unit_row.potential_rent, 10, 'active', 'Contrato operacional criado na confirmação de pagamento') returning * into lease_row;
  end if;
  return public.toggle_lease_payment(target_org, lease_row.id, target_competence, mark_paid);
end;
$$;
revoke all on function public.toggle_unit_payment(uuid, uuid, date, boolean) from public, anon;
grant execute on function public.toggle_unit_payment(uuid, uuid, date, boolean) to authenticated;

-- Make already occupied imported units available to the same payment flow.
do $$
declare org_id uuid; tenant_id uuid;
begin
  for org_id in select distinct organization_id from public.property_units where status in ('rented','for_sale') and coalesce(potential_rent, 0) > 0 loop
    select id into tenant_id from public.tenants where organization_id = org_id and name = 'Inquilino não informado' limit 1;
    if tenant_id is null then insert into public.tenants(organization_id, name) values(org_id, 'Inquilino não informado') returning id into tenant_id; end if;
    insert into public.leases(organization_id, unit_id, tenant_id, start_date, initial_rent, current_rent, due_day, status, notes)
    select u.organization_id, u.id, tenant_id, current_date, u.potential_rent, u.potential_rent, 10, 'active', 'Contrato operacional criado para unidade importada'
      from public.property_units u
     where u.organization_id = org_id and u.status in ('rented','for_sale') and coalesce(u.potential_rent, 0) > 0
       and not exists (select 1 from public.leases l where l.organization_id = u.organization_id and l.unit_id = u.id);
  end loop;
end $$;

create or replace function public.record_property_visit(target_org uuid, target_building uuid, target_unit uuid default null, visit_latitude numeric default null, visit_longitude numeric default null, visit_notes text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare visit_id uuid;
begin
  if not public.can_operate_properties(target_org) then raise exception 'not_authorized'; end if;
  if not exists (select 1 from public.buildings where id=target_building and organization_id=target_org) then raise exception 'building_not_found'; end if;
  insert into public.property_visits(organization_id, building_id, unit_id, visited_by, latitude, longitude, notes) values(target_org, target_building, target_unit, auth.uid(), visit_latitude, visit_longitude, left(coalesce(visit_notes,''), 500)) returning id into visit_id;
  return visit_id;
end;
$$;
revoke all on function public.record_property_visit(uuid, uuid, uuid, numeric, numeric, text) from public, anon;
grant execute on function public.record_property_visit(uuid, uuid, uuid, numeric, numeric, text) to authenticated;

create or replace function public.list_employee_documents(target_org uuid)
returns table(id uuid, asset_id uuid, building_id uuid, unit_id uuid, name text, category text, storage_path text, mime_type text, size_bytes bigint, is_primary boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.organization_members m where m.organization_id=target_org and m.user_id=auth.uid() and m.role='employee') then raise exception 'not_authorized'; end if;
  return query select d.id,d.asset_id,d.building_id,d.unit_id,d.name,d.category,d.storage_path,d.mime_type,d.size_bytes,d.is_primary,d.created_at from public.documents d where d.organization_id=target_org order by d.created_at desc;
end;
$$;
revoke all on function public.list_employee_documents(uuid) from public, anon;
grant execute on function public.list_employee_documents(uuid) to authenticated;

-- Employees can read operational files and upload, but cannot delete or alter records.
drop policy if exists "documents employee read" on public.documents;
drop policy if exists "documents employee insert" on public.documents;
create policy "documents employee read" on public.documents for select using (public.can_operate_properties(organization_id));
create policy "documents employee insert" on public.documents for insert with check (public.can_operate_properties(organization_id) and uploaded_by = auth.uid());
drop policy if exists "storage organization employee upload" on storage.objects;
create policy "storage organization employee upload" on storage.objects for insert with check (bucket_id='organization-documents' and public.can_operate_properties((storage.foldername(name))[1]::uuid));

create or replace function public.can_read_organization_storage(object_name text)
returns boolean language sql stable security definer set search_path = public, storage as $$
  select exists (
    select 1
    from public.documents d
    join public.organization_members m on m.organization_id = d.organization_id and m.user_id = auth.uid()
    left join public.member_visibility_settings s on s.organization_id = d.organization_id
    where d.storage_path = object_name
      and (
        m.role in ('owner','admin','manager','employee')
        or (
          m.role = 'viewer'
          and (
            (d.category = 'photo' and coalesce(s.show_photos, true))
            or (d.category <> 'photo' and coalesce(s.show_documents, true))
          )
        )
      )
  );
$$;


-- Employees never participate in ownership or revenue distribution.
create or replace function public._rebalance_organization_ownership(target_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  with ranked as (
    select member_id, member_type, row_number() over (order by joined_at, member_id) as position, count(*) over () as total
    from (
      select user_id as member_id, 'user'::text as member_type, joined_at from public.organization_members where organization_id = target_org and role <> 'employee'
      union all
      select id as member_id, 'contact'::text as member_type, created_at as joined_at from public.organization_contacts where organization_id = target_org and role <> 'employee'
    ) eligible
  ), assigned as (
    select *, case when position = total then round(100 - (total - 1) * round(100 / total, 4), 4) else round(100 / total, 4) end as percentage from ranked
  )
  update public.organization_members m set ownership_percentage = assigned.percentage from assigned where assigned.member_type = 'user' and m.organization_id = target_org and m.user_id = assigned.member_id;
  with ranked as (
    select member_id, member_type, row_number() over (order by joined_at, member_id) as position, count(*) over () as total
    from (
      select user_id as member_id, 'user'::text as member_type, joined_at from public.organization_members where organization_id = target_org and role <> 'employee'
      union all
      select id as member_id, 'contact'::text as member_type, created_at as joined_at from public.organization_contacts where organization_id = target_org and role <> 'employee'
    ) eligible
  ), assigned as (
    select *, case when position = total then round(100 - (total - 1) * round(100 / total, 4), 4) else round(100 / total, 4) end as percentage from ranked
  )
  update public.organization_contacts c set ownership_percentage = assigned.percentage from assigned where assigned.member_type = 'contact' and c.organization_id = target_org and c.id = assigned.member_id;
  update public.organization_members set ownership_percentage = 0 where organization_id = target_org and role = 'employee';
  update public.organization_contacts set ownership_percentage = 0 where organization_id = target_org and role = 'employee';
end;
$$;

create or replace function public.update_member_role(target_org uuid, target_user uuid, new_role public.member_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_org_member(target_org, 'admin') then raise exception 'not_authorized'; end if;
  if new_role = 'owner' then raise exception 'owner_role_locked'; end if;
  if target_user = auth.uid() then raise exception 'cannot_change_own_role'; end if;
  if exists (select 1 from public.organization_members where organization_id = target_org and user_id = target_user) then update public.organization_members set role = new_role where organization_id = target_org and user_id = target_user;
  elsif exists (select 1 from public.organization_contacts where organization_id = target_org and id = target_user) then update public.organization_contacts set role = new_role where organization_id = target_org and id = target_user;
  else raise exception 'member_not_found'; end if;
  perform public._rebalance_organization_ownership(target_org);
end;
$$;
grant execute on function public.update_member_role(uuid, uuid, public.member_role) to authenticated;

create or replace function public.update_member_ownership(target_org uuid, target_user uuid, new_percentage numeric)
returns void language plpgsql security definer set search_path = public as $$
declare target_kind text; other_count integer;
begin
  if not public.is_org_member(target_org, 'admin') then raise exception 'not_authorized'; end if;
  if new_percentage < 0 or new_percentage > 100 then raise exception 'invalid_percentage'; end if;
  if exists (select 1 from public.organization_members where organization_id = target_org and user_id = target_user) then target_kind := 'user';
  elsif exists (select 1 from public.organization_contacts where organization_id = target_org and id = target_user) then target_kind := 'contact';
  else raise exception 'member_not_found'; end if;
  if (target_kind = 'user' and exists (select 1 from public.organization_members where organization_id = target_org and user_id = target_user and role = 'employee')) or (target_kind = 'contact' and exists (select 1 from public.organization_contacts where organization_id = target_org and id = target_user and role = 'employee')) then
    if new_percentage <> 0 then raise exception 'employee_has_no_ownership'; end if;
    if target_kind = 'user' then update public.organization_members set ownership_percentage = 0 where organization_id = target_org and user_id = target_user; else update public.organization_contacts set ownership_percentage = 0 where organization_id = target_org and id = target_user; end if;
    return;
  end if;
  if target_kind = 'user' then update public.organization_members set ownership_percentage = round(new_percentage, 4) where organization_id = target_org and user_id = target_user;
  else update public.organization_contacts set ownership_percentage = round(new_percentage, 4) where organization_id = target_org and id = target_user;
  end if;
  select count(*) into other_count from (
    select user_id as member_id from public.organization_members where organization_id = target_org and user_id <> target_user and role <> 'employee'
    union all select id as member_id from public.organization_contacts where organization_id = target_org and id <> target_user and role <> 'employee'
  ) others;
  if other_count > 0 then
    with ranked as (
      select member_id, member_kind, row_number() over (order by joined_at, member_id) as position from (
        select user_id as member_id, 'user'::text as member_kind, joined_at from public.organization_members where organization_id = target_org and user_id <> target_user and role <> 'employee'
        union all select id as member_id, 'contact'::text as member_kind, created_at as joined_at from public.organization_contacts where organization_id = target_org and id <> target_user and role <> 'employee'
      ) others
    ), assigned as (
      select *, case when position = other_count then round(100 - new_percentage - (other_count - 1) * round((100 - new_percentage) / other_count, 4), 4) else round((100 - new_percentage) / other_count, 4) end as percentage from ranked
    )
    update public.organization_members m set ownership_percentage = assigned.percentage from assigned where assigned.member_kind = 'user' and m.organization_id = target_org and m.user_id = assigned.member_id;
    with ranked as (
      select member_id, member_kind, row_number() over (order by joined_at, member_id) as position from (
        select user_id as member_id, 'user'::text as member_kind, joined_at from public.organization_members where organization_id = target_org and user_id <> target_user and role <> 'employee'
        union all select id as member_id, 'contact'::text as member_kind, created_at as joined_at from public.organization_contacts where organization_id = target_org and id <> target_user and role <> 'employee'
      ) others
    ), assigned as (
      select *, case when position = other_count then round(100 - new_percentage - (other_count - 1) * round((100 - new_percentage) / other_count, 4), 4) else round((100 - new_percentage) / other_count, 4) end as percentage from ranked
    )
    update public.organization_contacts c set ownership_percentage = assigned.percentage from assigned where assigned.member_kind = 'contact' and c.organization_id = target_org and c.id = assigned.member_id;
  end if;
end;
$$;
