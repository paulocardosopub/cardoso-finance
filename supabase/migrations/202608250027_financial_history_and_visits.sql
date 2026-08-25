-- Pagamentos operacionais: histórico de crédito/estorno e cancelamento compatível com o schema atual.

create table if not exists public.financial_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null check (event_type in ('credit', 'debit')),
  amount numeric(18,2) not null check (amount >= 0),
  description text not null,
  source_payment_id uuid references public.lease_payments(id) on delete set null,
  source_sale_id uuid references public.sales(id) on delete set null,
  occurred_at timestamptz not null default timezone('utc', now()),
  created_by uuid references auth.users(id) on delete set null
);
create index if not exists financial_history_org_date_idx on public.financial_history(organization_id, occurred_at desc);
alter table public.financial_history enable row level security;
drop policy if exists "financial history operational read" on public.financial_history;
create policy "financial history operational read" on public.financial_history for select using (public.can_operate_properties(organization_id));
revoke all on public.financial_history from anon;
grant select on public.financial_history to authenticated;

create or replace function public.toggle_lease_payment(target_org uuid, target_lease uuid, target_competence date, mark_paid boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  lease_row public.leases%rowtype;
  payment_row public.lease_payments%rowtype;
  asset_id uuid;
  asset_name text;
  tenant_name text;
  unit_code text;
  competence_date date := date_trunc('month', target_competence)::date;
  expected numeric;
  property_label text;
begin
  if not public.can_operate_properties(target_org) then raise exception 'not_authorized'; end if;
  select l.* into lease_row
    from public.leases l
   where l.id = target_lease
     and l.organization_id = target_org
     and l.status in ('active','ending');
  if lease_row.id is null then raise exception 'lease_not_found'; end if;

  expected := greatest(0, lease_row.current_rent);
  select p.* into payment_row
    from public.lease_payments p
   where p.lease_id = target_lease and p.competence = competence_date
   for update;

  if payment_row.id is null then
    insert into public.lease_payments(lease_id, organization_id, competence, due_date, expected_amount, received_amount, received_at, status, notes)
    values (
      target_lease,
      target_org,
      competence_date,
      competence_date + greatest(0, least(30, lease_row.due_day - 1)),
      expected,
      case when mark_paid then expected else 0 end,
      case when mark_paid then current_date else null end,
      (case when mark_paid then 'paid' else 'pending' end)::public.payment_status,
      'Confirmação operacional'
    ) returning * into payment_row;
  else
    update public.lease_payments
       set expected_amount = expected,
           received_amount = case when mark_paid then expected else 0 end,
           received_at = case when mark_paid then coalesce(received_at, current_date) else null end,
           status = (case when mark_paid then 'paid' else 'pending' end)::public.payment_status
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
    values(target_org, asset_id, expected, current_date, competence_date, 'rent', property_label, 'lease_payment', 'Criado pela confirmação do pagamento', auth.uid(), payment_row.id)
    on conflict (source_payment_id) where source_payment_id is not null
    do update set value=excluded.value, revenue_date=excluded.revenue_date, competence=excluded.competence, description=excluded.description, notes=excluded.notes;

    if not exists (
      select 1 from public.financial_history h
       where h.source_payment_id = payment_row.id and h.event_type = 'credit'
    ) then
      insert into public.financial_history(organization_id, event_type, amount, description, source_payment_id, created_by)
      values(target_org, 'credit', expected, property_label, payment_row.id, auth.uid());
    end if;
  else
    delete from public.revenues where source_payment_id = payment_row.id;
    insert into public.financial_history(organization_id, event_type, amount, description, source_payment_id, created_by)
    values(target_org, 'debit', expected, 'Estorno · ' || property_label, payment_row.id, auth.uid());
  end if;

  return jsonb_build_object('paymentId', payment_row.id, 'leaseId', target_lease, 'competence', competence_date, 'status', payment_row.status, 'amount', payment_row.received_amount, 'markedPaid', mark_paid, 'description', property_label);
end;
$$;
revoke all on function public.toggle_lease_payment(uuid, uuid, date, boolean) from public, anon;
grant execute on function public.toggle_lease_payment(uuid, uuid, date, boolean) to authenticated;

create or replace function public.clear_property_visit_history(target_org uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare deleted_count integer;
begin
  if not public.is_org_member(target_org, 'manager') then raise exception 'not_authorized'; end if;
  delete from public.property_visits where organization_id = target_org;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
revoke all on function public.clear_property_visit_history(uuid) from public, anon;
grant execute on function public.clear_property_visit_history(uuid) to authenticated;

create or replace function public.record_property_sale(target_org uuid, target_building uuid, sale_price numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  building_row public.buildings%rowtype;
  asset_row public.assets%rowtype;
  sale_id uuid;
  revenue_id uuid;
  sale_description text;
begin
  if not public.is_org_member(target_org, 'manager') then raise exception 'not_authorized'; end if;
  if sale_price is null or sale_price <= 0 then raise exception 'invalid_sale_price'; end if;
  select b.* into building_row from public.buildings b where b.id = target_building and b.organization_id = target_org for update;
  if building_row.id is null then raise exception 'building_not_found'; end if;
  if building_row.status = 'sold' then raise exception 'already_sold'; end if;
  select a.* into asset_row from public.assets a where a.id = building_row.asset_id and a.organization_id = target_org for update;
  if asset_row.id is null then raise exception 'asset_not_found'; end if;
  sale_description := 'Venda · ' || asset_row.name;
  insert into public.sales(organization_id, asset_id, acquisition_value, sale_price, sale_date, notes)
  values(target_org, asset_row.id, coalesce(building_row.acquisition_value, asset_row.acquisition_value), sale_price, current_date, 'Venda confirmada pela gestão')
  returning id into sale_id;
  insert into public.revenues(organization_id, asset_id, value, revenue_date, competence, category, description, origin, notes, created_by, source_sale_id)
  values(target_org, asset_row.id, sale_price, current_date, date_trunc('month', current_date)::date, 'sale', sale_description, 'property_sale', 'Crédito criado automaticamente pela venda do imóvel', auth.uid(), sale_id)
  returning id into revenue_id;
  insert into public.financial_history(organization_id, event_type, amount, description, source_sale_id, created_by)
  values(target_org, 'credit', sale_price, sale_description, sale_id, auth.uid());
  update public.leases set status = 'terminated', end_date = current_date, updated_at = timezone('utc', now()) where organization_id = target_org and unit_id in (select id from public.property_units where building_id = target_building);
  update public.property_units set status = 'sold', updated_at = timezone('utc', now()) where organization_id = target_org and building_id = target_building;
  update public.buildings set status = 'sold', current_value = sale_price, updated_at = timezone('utc', now()) where id = target_building and organization_id = target_org;
  update public.assets set status = 'sold', current_value = sale_price, updated_at = timezone('utc', now()) where id = asset_row.id and organization_id = target_org;
  return jsonb_build_object('saleId', sale_id, 'revenueId', revenue_id, 'buildingId', target_building, 'amount', sale_price);
end;
$$;
revoke all on function public.record_property_sale(uuid, uuid, numeric) from public, anon;
grant execute on function public.record_property_sale(uuid, uuid, numeric) to authenticated;
