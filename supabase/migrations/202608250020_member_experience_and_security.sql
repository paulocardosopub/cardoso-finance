-- Member experience and hard access boundary.
-- The database value `viewer` remains unchanged for backwards compatibility;
-- the application presents that role as "Membro".

create table if not exists public.member_visibility_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  show_total_assets boolean not null default true,
  show_property_values boolean not null default true,
  show_rental_info boolean not null default true,
  show_property_status boolean not null default true,
  show_photos boolean not null default true,
  show_locations boolean not null default true,
  show_map boolean not null default true,
  show_documents boolean not null default true,
  show_ownership_by_beneficiary boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.member_visibility_settings (organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;

create or replace function public.create_member_visibility_settings()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.member_visibility_settings (organization_id)
  values (new.id)
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

drop trigger if exists organizations_create_member_visibility on public.organizations;
create trigger organizations_create_member_visibility
after insert on public.organizations
for each row execute procedure public.create_member_visibility_settings();

alter table public.member_visibility_settings enable row level security;
drop policy if exists "member visibility manager read" on public.member_visibility_settings;
drop policy if exists "member visibility admin insert" on public.member_visibility_settings;
drop policy if exists "member visibility admin update" on public.member_visibility_settings;
create policy "member visibility manager read" on public.member_visibility_settings
for select using (public.is_org_member(organization_id, 'manager'));
create policy "member visibility admin insert" on public.member_visibility_settings
for insert with check (public.is_org_member(organization_id, 'admin'));
create policy "member visibility admin update" on public.member_visibility_settings
for update using (public.is_org_member(organization_id, 'admin'))
with check (public.is_org_member(organization_id, 'admin'));

create or replace function public.member_visibility_enabled(target_org uuid, setting_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select case setting_name
    when 'total_assets' then coalesce(s.show_total_assets, true)
    when 'property_values' then coalesce(s.show_property_values, true)
    when 'rental_info' then coalesce(s.show_rental_info, true)
    when 'property_status' then coalesce(s.show_property_status, true)
    when 'photos' then coalesce(s.show_photos, true)
    when 'locations' then coalesce(s.show_locations, true)
    when 'map' then coalesce(s.show_map, true)
    when 'documents' then coalesce(s.show_documents, true)
    when 'ownership_by_beneficiary' then coalesce(s.show_ownership_by_beneficiary, false)
    else false
  end
  from public.member_visibility_settings s
  where s.organization_id = target_org
    and public.is_org_member(target_org);
$$;

create or replace function public.update_member_visibility(
  target_org uuid,
  total_assets boolean,
  property_values boolean,
  rental_info boolean,
  property_status boolean,
  photos boolean,
  locations boolean,
  map_visible boolean,
  documents_visible boolean,
  ownership_by_beneficiary boolean
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_org_member(target_org, 'admin') then raise exception 'not_authorized'; end if;
  insert into public.member_visibility_settings (
    organization_id, show_total_assets, show_property_values, show_rental_info,
    show_property_status, show_photos, show_locations, show_map, show_documents,
    show_ownership_by_beneficiary, updated_by, updated_at
  ) values (
    target_org, total_assets, property_values, rental_info,
    property_status, photos, locations, map_visible, documents_visible,
    ownership_by_beneficiary, auth.uid(), timezone('utc', now())
  ) on conflict (organization_id) do update set
    show_total_assets = excluded.show_total_assets,
    show_property_values = excluded.show_property_values,
    show_rental_info = excluded.show_rental_info,
    show_property_status = excluded.show_property_status,
    show_photos = excluded.show_photos,
    show_locations = excluded.show_locations,
    show_map = excluded.show_map,
    show_documents = excluded.show_documents,
    show_ownership_by_beneficiary = excluded.show_ownership_by_beneficiary,
    updated_by = auth.uid(),
    updated_at = timezone('utc', now());
end;
$$;

-- Viewers never read base business tables. Sanitized read-only RPCs below are
-- the only data surface for that role, which prevents column probing via API.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'assets','buildings','property_units','properties','tenants','leases',
    'lease_payments','valuations','revenues','expenses','sales','distributions',
    'distribution_items','documents','audit_logs'
  ] loop
    execute format('drop policy if exists %I on public.%I', table_name || ' member read', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || ' manager read', table_name);
    execute format(
      'create policy %I on public.%I for select using (public.is_org_member(organization_id, ''manager''))',
      table_name || ' manager read', table_name
    );
  end loop;
end;
$$;

drop policy if exists "bank accounts member read" on public.bank_accounts;
drop policy if exists "bank accounts manager read" on public.bank_accounts;
create policy "bank accounts manager read" on public.bank_accounts
for select using (public.is_org_member(organization_id, 'manager'));

drop policy if exists "expense responsibilities member read" on public.expense_responsibilities;
drop policy if exists "expense responsibilities manager read" on public.expense_responsibilities;
create policy "expense responsibilities manager read" on public.expense_responsibilities
for select using (public.is_org_member(organization_id, 'manager'));

drop policy if exists "lease adjustments member read" on public.lease_adjustments;
drop policy if exists "lease adjustments manager read" on public.lease_adjustments;
create policy "lease adjustments manager read" on public.lease_adjustments
for select using (public.is_org_member(organization_id, 'manager'));

drop policy if exists "notifications member read" on public.notifications;
drop policy if exists "notifications manager read" on public.notifications;
drop policy if exists "notifications member update" on public.notifications;
drop policy if exists "notifications manager update" on public.notifications;
create policy "notifications manager read" on public.notifications
for select using (public.is_org_member(organization_id, 'manager'));
create policy "notifications manager update" on public.notifications
for update using (public.is_org_member(organization_id, 'manager'))
with check (public.is_org_member(organization_id, 'manager'));

drop policy if exists "organization contacts member read" on public.organization_contacts;
drop policy if exists "organization contacts manager read" on public.organization_contacts;
create policy "organization contacts manager read" on public.organization_contacts
for select using (public.is_org_member(organization_id, 'manager'));

drop policy if exists "members read" on public.organization_members;
drop policy if exists "members self or manager read" on public.organization_members;
create policy "members self or manager read" on public.organization_members
for select using (user_id = auth.uid() or public.is_org_member(organization_id, 'manager'));

drop policy if exists "invitations member read" on public.invitations;
drop policy if exists "invitations recipient read" on public.invitations;

create or replace function public.get_member_portfolio(target_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  viewer_role public.member_role;
  settings public.member_visibility_settings%rowtype;
  result jsonb;
begin
  select role into viewer_role
  from public.organization_members
  where organization_id = target_org and user_id = auth.uid();
  if viewer_role is null then raise exception 'not_authorized'; end if;
  if viewer_role <> 'viewer' then raise exception 'member_endpoint_only'; end if;

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

  with unit_rows as (
    select
      u.building_id,
      jsonb_build_object(
        'id', u.id,
        'code', u.code,
        'type', u.unit_type,
        'quantity', u.quantity,
        'status', case when settings.show_property_status then u.status::text else null end,
        'rent', case when settings.show_rental_info then coalesce((
          select l.current_rent from public.leases l
          where l.organization_id = target_org and l.unit_id = u.id and l.status in ('active','ending')
          order by l.updated_at desc limit 1
        ), u.potential_rent) else 0 end
      ) as item
    from public.property_units u
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
      'totalRent', case when settings.show_rental_info then coalesce((
        select sum(coalesce((select l.current_rent from public.leases l where l.organization_id = target_org and l.unit_id = u.id and l.status in ('active','ending') order by l.updated_at desc limit 1), u.potential_rent))
        from public.property_units u join public.buildings b on b.id = u.building_id
        where u.organization_id = target_org and b.status <> 'sold'
      ), 0) else 0 end
    ),
    'buildings', coalesce((select jsonb_agg(item order by item ->> 'name') from building_rows), '[]'::jsonb),
    'ownership', case when settings.show_ownership_by_beneficiary then coalesce((select jsonb_agg(jsonb_build_object('name', name, 'percentage', percentage) order by joined_at) from ownership_rows), '[]'::jsonb) else '[]'::jsonb end
  ) into result;
  return result;
end;
$$;

create or replace function public.list_member_documents(target_org uuid)
returns table (
  id uuid, asset_id uuid, building_id uuid, unit_id uuid, name text, category text,
  storage_path text, mime_type text, size_bytes bigint, is_primary boolean, created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare viewer_role public.member_role;
begin
  select role into viewer_role from public.organization_members
  where organization_id = target_org and user_id = auth.uid();
  if viewer_role is null then raise exception 'not_authorized'; end if;
  if viewer_role <> 'viewer' then raise exception 'member_endpoint_only'; end if;
  return query
  select d.id, d.asset_id, d.building_id, d.unit_id, d.name, d.category,
         d.storage_path, d.mime_type, d.size_bytes, d.is_primary, d.created_at
  from public.documents d
  where d.organization_id = target_org
    and ((d.category = 'photo' and public.member_visibility_enabled(target_org, 'photos'))
      or (d.category <> 'photo' and public.member_visibility_enabled(target_org, 'documents')))
  order by d.created_at desc;
end;
$$;

create or replace function public.can_read_organization_storage(object_name text)
returns boolean language sql stable security definer set search_path = public, storage as $$
  select exists (
    select 1
    from public.documents d
    join public.organization_members m
      on m.organization_id = d.organization_id and m.user_id = auth.uid()
    left join public.member_visibility_settings s on s.organization_id = d.organization_id
    where d.storage_path = object_name
      and (
        m.role in ('owner','admin','manager')
        or (m.role = 'viewer' and (
          (d.category = 'photo' and coalesce(s.show_photos, true))
          or (d.category <> 'photo' and coalesce(s.show_documents, true))
        ))
      )
  );
$$;

drop policy if exists "storage organization read" on storage.objects;
create policy "storage organization read" on storage.objects
for select using (bucket_id = 'organization-documents' and public.can_read_organization_storage(name));

-- Administrative and operational RPCs must not expose organization data or
-- perform writes for viewers when called directly.
create or replace function public.list_organization_members(target_org uuid)
returns table (member_id uuid, user_id uuid, contact_id uuid, full_name text, email text, role public.member_role, ownership_percentage numeric, joined_at timestamptz, is_placeholder boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_org_member(target_org, 'manager') then raise exception 'not_authorized'; end if;
  return query
  select m.user_id, m.user_id, null::uuid, coalesce(nullif(p.full_name, ''), split_part(u.email, '@', 1), 'Usuário autenticado'), u.email, m.role, m.ownership_percentage, m.joined_at, false
  from public.organization_members m join auth.users u on u.id = m.user_id left join public.profiles p on p.id = m.user_id
  where m.organization_id = target_org
  union all
  select c.id, null::uuid, c.id, c.full_name, c.email, c.role, c.ownership_percentage, c.created_at, true
  from public.organization_contacts c where c.organization_id = target_org
  order by joined_at asc;
end;
$$;

create or replace function public.refresh_lease_notifications(target_org uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare created_count integer := 0; inserted_count integer := 0;
begin
  if not public.is_org_member(target_org, 'manager') then raise exception 'not_authorized'; end if;

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

revoke all on function public._rebalance_organization_ownership(uuid) from public, anon, authenticated;
revoke all on function public.create_member_visibility_settings() from public, anon, authenticated;
revoke all on function public.get_member_portfolio(uuid) from public, anon;
revoke all on function public.list_member_documents(uuid) from public, anon;
revoke all on function public.update_member_visibility(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.get_member_portfolio(uuid) to authenticated;
grant execute on function public.list_member_documents(uuid) to authenticated;
grant execute on function public.update_member_visibility(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;
