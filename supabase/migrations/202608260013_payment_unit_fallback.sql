-- Robustez na confirmação de aluguéis de unidades importadas sem contrato formal.
-- Algumas unidades (como SQS 314) têm aluguel cadastrado, mas ainda não possuem
-- uma linha em leases. O fluxo operacional deve criar esse contrato mínimo.
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
  unit_rent numeric;
begin
  if not public.can_operate_properties(target_org) then raise exception 'not_authorized'; end if;

  select u.* into unit_row
    from public.property_units u
   where u.id = target_unit
     and u.organization_id = target_org;
  if unit_row.id is null then raise exception 'unit_not_found'; end if;

  select l.* into lease_row
    from public.leases l
   where l.organization_id = target_org
     and l.unit_id = target_unit
     and l.status in ('active','ending')
   order by case when l.status = 'active' then 0 else 1 end, l.updated_at desc
   limit 1;

  -- Imported units can be marked as rented before a formal lease is created.
  -- Use the synchronized unit rent as the source of truth in that case.
  if lease_row.id is null then
    unit_rent := greatest(coalesce(unit_row.potential_rent, 0), 0);
    if unit_rent <= 0 or unit_row.status = 'sold'::public.unit_status then
      raise exception 'lease_not_found';
    end if;
    if not mark_paid then
      raise exception 'lease_not_found';
    end if;

    select t.id into tenant_id
      from public.tenants t
     where t.organization_id = target_org
       and lower(trim(t.name)) = lower('Inquilino não informado')
     limit 1;
    if tenant_id is null then
      insert into public.tenants(organization_id, name)
      values(target_org, 'Inquilino não informado')
      returning id into tenant_id;
    end if;

    insert into public.leases(
      organization_id, unit_id, tenant_id, start_date,
      initial_rent, current_rent, due_day, status, notes
    ) values(
      target_org, target_unit, tenant_id, current_date,
      unit_rent, unit_rent, 10, 'active',
      'Contrato operacional criado na confirmação de pagamento'
    ) returning * into lease_row;
  end if;

  return public.toggle_lease_payment(
    target_org, lease_row.id, target_competence, mark_paid,
    target_payment_date, target_amount, target_receipt_path
  );
end;
$$;

revoke all on function public.toggle_unit_payment(uuid, uuid, date, boolean, date, numeric, text) from public, anon;
grant execute on function public.toggle_unit_payment(uuid, uuid, date, boolean, date, numeric, text) to authenticated;
