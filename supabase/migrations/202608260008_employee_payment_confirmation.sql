-- Confirmação operacional de aluguel com data, valor recebido e comprovante opcional.
alter table public.lease_payments
  add column if not exists receipt_path text;

create or replace function public.toggle_lease_payment(
  target_org uuid,
  target_lease uuid,
  target_competence date,
  mark_paid boolean,
  target_payment_date date,
  target_amount numeric,
  target_receipt_path text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  lease_row public.leases%rowtype;
  payment_row public.lease_payments%rowtype;
  asset_id uuid;
  asset_name text;
  tenant_name text;
  unit_code text;
  competence_date date := date_trunc('month', target_competence)::date;
  payment_date date := coalesce(target_payment_date, current_date);
  expected numeric;
  received numeric;
  previous_received numeric := 0;
  property_label text;
begin
  if not public.can_operate_properties(target_org) then raise exception 'not_authorized'; end if;
  select l.* into lease_row
    from public.leases l
   where l.id = target_lease
     and l.organization_id = target_org
     and l.status in ('active','ending');
  if lease_row.id is null then raise exception 'lease_not_found'; end if;
  if target_receipt_path is not null and target_receipt_path not like target_org::text || '/%' then raise exception 'invalid_receipt_path'; end if;

  expected := greatest(0, lease_row.current_rent);
  received := case when mark_paid then coalesce(target_amount, expected) else 0 end;
  if mark_paid and received <= 0 then raise exception 'invalid_payment_amount'; end if;

  select p.* into payment_row
    from public.lease_payments p
   where p.lease_id = target_lease and p.competence = competence_date
   for update;
  previous_received := coalesce(payment_row.received_amount, 0);

  if payment_row.id is null then
    insert into public.lease_payments(lease_id, organization_id, competence, due_date, expected_amount, received_amount, received_at, receipt_path, status, notes)
    values(target_lease, target_org, competence_date, competence_date + greatest(0, least(30, lease_row.due_day - 1)), expected, received, case when mark_paid then payment_date else null end, target_receipt_path, (case when mark_paid then 'paid' else 'pending' end)::public.payment_status, 'Confirmação operacional')
    returning * into payment_row;
  else
    update public.lease_payments
       set expected_amount = expected,
           received_amount = received,
           received_at = case when mark_paid then payment_date else null end,
           receipt_path = coalesce(nullif(target_receipt_path, ''), receipt_path),
           status = (case when mark_paid then 'paid' else 'pending' end)::public.payment_status,
           updated_at = timezone('utc', now())
     where id = payment_row.id
     returning * into payment_row;
  end if;

  select b.asset_id, a.name, u.code, t.name
    into asset_id, asset_name, unit_code, tenant_name
    from public.property_units u
    join public.buildings b on b.id = u.building_id
    left join public.assets a on a.id = b.asset_id
    left join public.tenants t on t.id = lease_row.tenant_id
   where u.id = lease_row.unit_id;
  property_label := 'Aluguel · ' || coalesce(asset_name, 'Imóvel') || coalesce(' · ' || nullif(unit_code, ''), '') || coalesce(' · ' || nullif(tenant_name, ''), '');

  if mark_paid then
    insert into public.revenues(organization_id, asset_id, value, revenue_date, competence, category, description, origin, notes, created_by, source_payment_id)
    values(target_org, asset_id, received, payment_date, competence_date, 'rent', property_label, 'lease_payment', 'Criado pela confirmação do pagamento', auth.uid(), payment_row.id)
    on conflict (source_payment_id) where source_payment_id is not null
    do update set value=excluded.value, revenue_date=excluded.revenue_date, competence=excluded.competence, description=excluded.description, notes=excluded.notes;

    if exists (select 1 from public.financial_history h where h.source_payment_id = payment_row.id and h.event_type = 'credit') then
      update public.financial_history set amount = received, description = property_label where source_payment_id = payment_row.id and event_type = 'credit';
    else
      insert into public.financial_history(organization_id, event_type, amount, description, source_payment_id, created_by)
      values(target_org, 'credit', received, property_label, payment_row.id, auth.uid());
    end if;
  else
    delete from public.revenues where source_payment_id = payment_row.id;
    insert into public.financial_history(organization_id, event_type, amount, description, source_payment_id, created_by)
    values(target_org, 'debit', case when previous_received > 0 then previous_received else expected end, 'Estorno · ' || property_label, payment_row.id, auth.uid());
  end if;

  return jsonb_build_object('paymentId', payment_row.id, 'leaseId', target_lease, 'competence', competence_date, 'status', payment_row.status, 'amount', payment_row.received_amount, 'paymentDate', payment_row.received_at, 'receiptPath', payment_row.receipt_path, 'markedPaid', mark_paid, 'description', property_label);
end;
$$;

create or replace function public.toggle_lease_payment(target_org uuid, target_lease uuid, target_competence date, mark_paid boolean)
returns jsonb language sql security definer set search_path = public as $$
  select public.toggle_lease_payment(target_org, target_lease, target_competence, mark_paid, null, null, null);
$$;

create or replace function public.toggle_unit_payment(
  target_org uuid,
  target_unit uuid,
  target_competence date,
  mark_paid boolean,
  target_payment_date date,
  target_amount numeric,
  target_receipt_path text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  unit_row public.property_units%rowtype;
  lease_row public.leases%rowtype;
  tenant_id uuid;
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
  return public.toggle_lease_payment(target_org, lease_row.id, target_competence, mark_paid, target_payment_date, target_amount, target_receipt_path);
end;
$$;

create or replace function public.toggle_unit_payment(target_org uuid, target_unit uuid, target_competence date, mark_paid boolean)
returns jsonb language sql security definer set search_path = public as $$
  select public.toggle_unit_payment(target_org, target_unit, target_competence, mark_paid, null, null, null);
$$;

revoke all on function public.toggle_lease_payment(uuid, uuid, date, boolean, date, numeric, text) from public, anon;
grant execute on function public.toggle_lease_payment(uuid, uuid, date, boolean, date, numeric, text) to authenticated;
revoke all on function public.toggle_lease_payment(uuid, uuid, date, boolean) from public, anon;
grant execute on function public.toggle_lease_payment(uuid, uuid, date, boolean) to authenticated;
revoke all on function public.toggle_unit_payment(uuid, uuid, date, boolean, date, numeric, text) from public, anon;
grant execute on function public.toggle_unit_payment(uuid, uuid, date, boolean, date, numeric, text) to authenticated;
revoke all on function public.toggle_unit_payment(uuid, uuid, date, boolean) from public, anon;
grant execute on function public.toggle_unit_payment(uuid, uuid, date, boolean) to authenticated;
