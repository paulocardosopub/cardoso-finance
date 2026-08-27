-- Corrige a atualização de unidades já vinculadas a um contrato.
-- O parâmetro due_day colidia com a coluna leases.due_day e fazia o RPC
-- falhar antes de persistir o novo aluguel.
create or replace function public.update_employee_unit(
  target_org uuid, target_unit uuid, unit_status text, rental_value numeric, tenant_name text, due_day integer default 10
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  unit_org uuid;
  existing_lease public.leases%rowtype;
  new_tenant_id uuid;
  normalized_name text;
  requested_due_day integer := greatest(1, least(31, coalesce(due_day, 10)));
  result jsonb;
begin
  if not public.can_operate_properties(target_org) then raise exception 'not_authorized'; end if;
  select organization_id into unit_org from public.property_units where id = target_unit;
  if unit_org is null or unit_org <> target_org then raise exception 'unit_not_found'; end if;
  if unit_status not in ('rented','vacant','maintenance','service','negotiation','for_sale') then raise exception 'invalid_status'; end if;
  if rental_value is null or rental_value < 0 then raise exception 'invalid_rent'; end if;

  normalized_name := nullif(trim(coalesce(tenant_name, '')), '');
  update public.property_units
     set status = unit_status::public.unit_status,
         potential_rent = rental_value,
         updated_at = timezone('utc', now())
   where id = target_unit and organization_id = target_org;

  select l.* into existing_lease
    from public.leases l
   where l.organization_id = target_org
     and l.unit_id = target_unit
     and l.status in ('active','ending','draft')
   order by case when l.status='active' then 0 else 1 end, l.updated_at desc
   limit 1;

  if unit_status in ('rented','for_sale') then
    if normalized_name is not null then
      select id into new_tenant_id
        from public.tenants
       where organization_id = target_org and lower(name) = lower(normalized_name)
       limit 1;
      if new_tenant_id is null then
        insert into public.tenants(organization_id, name)
        values(target_org, normalized_name)
        returning id into new_tenant_id;
      end if;
    end if;

    if existing_lease.id is null then
      insert into public.leases(
        organization_id, unit_id, tenant_id, start_date,
        initial_rent, current_rent, due_day, status, notes
      ) values(
        target_org, target_unit, new_tenant_id, current_date,
        rental_value, rental_value, requested_due_day, 'active', 'Atualizado pela Funcionária'
      ) returning * into existing_lease;
    else
      update public.leases as lease
         set tenant_id = new_tenant_id,
             current_rent = rental_value,
             due_day = requested_due_day,
             status = 'active',
             updated_at = timezone('utc', now())
       where lease.id = existing_lease.id
         and lease.organization_id = target_org
      returning * into existing_lease;
    end if;

    -- Mantém a cobrança do mês em sincronia com o contrato atualizado.
    update public.lease_payments
       set expected_amount = rental_value,
           due_date = date_trunc('month', competence)::date + greatest(0, requested_due_day - 1),
           updated_at = timezone('utc', now())
     where lease_id = existing_lease.id
       and competence = date_trunc('month', current_date)::date;
  elsif existing_lease.id is not null then
    update public.leases as lease
       set status = 'terminated', updated_at = timezone('utc', now())
     where lease.id = existing_lease.id and lease.organization_id = target_org;
  end if;

  select jsonb_build_object(
    'unitId', target_unit,
    'status', unit_status,
    'rent', rental_value,
    'tenantName', normalized_name
  ) into result;
  return result;
end;
$$;

revoke all on function public.update_employee_unit(uuid, uuid, text, numeric, text, integer) from public, anon;
grant execute on function public.update_employee_unit(uuid, uuid, text, numeric, text, integer) to authenticated;
