-- Funcionária/gestão: pagamentos operacionais e aluguel sincronizado.

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

create or replace function public.toggle_lease_payment(target_org uuid, target_lease uuid, target_competence date, mark_paid boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare lease_row public.leases%rowtype; payment_row public.lease_payments%rowtype; asset_id uuid; tenant_name text; competence_date date := date_trunc('month', target_competence)::date; expected numeric;
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
grant execute on function public.toggle_lease_payment(uuid, uuid, date, boolean) to authenticated;

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

-- Unidades importadas como alugadas passam a participar da mesma rotina.
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
