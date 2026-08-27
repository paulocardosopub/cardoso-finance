-- Managers and administrators may audit all real employee payment confirmations
-- or select one employee. Employees remain restricted to their own account.
create or replace function public.list_employee_payment_history(target_org uuid, target_employee uuid)
returns table (
  id uuid,
  payment_id uuid,
  description text,
  amount numeric,
  payment_date date,
  competence date,
  notes text,
  receipt_path text,
  registered_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
  manager_view boolean;
begin
  if not public.can_operate_properties(target_org) then
    raise exception 'not_authorized';
  end if;

  select exists (
    select 1
      from public.organization_members m
     where m.organization_id = target_org
       and m.user_id = auth.uid()
       and m.role in ('owner', 'admin', 'manager')
  ) into manager_view;

  return query
  select
    r.id,
    r.source_payment_id,
    r.description,
    r.value,
    coalesce(p.received_at, r.revenue_date),
    coalesce(p.competence, r.competence, r.revenue_date),
    coalesce(nullif(p.notes, ''), r.notes, ''),
    p.receipt_path,
    r.created_at
  from public.revenues r
  left join public.lease_payments p on p.id = r.source_payment_id
  where r.organization_id = target_org
    and r.origin = 'lease_payment'
    and (manager_view and (target_employee is null or r.created_by = target_employee)
         or (not manager_view and r.created_by = auth.uid()))
    and (p.id is null or p.status = 'paid')
  order by coalesce(p.received_at, r.revenue_date) desc, r.created_at desc;
end;
$$;

create or replace function public.list_employee_payment_history(target_org uuid)
returns table (
  id uuid,
  payment_id uuid,
  description text,
  amount numeric,
  payment_date date,
  competence date,
  notes text,
  receipt_path text,
  registered_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select * from public.list_employee_payment_history(target_org, null::uuid);
$$;

revoke all on function public.list_employee_payment_history(uuid, uuid) from public, anon;
grant execute on function public.list_employee_payment_history(uuid, uuid) to authenticated;
revoke all on function public.list_employee_payment_history(uuid) from public, anon;
grant execute on function public.list_employee_payment_history(uuid) to authenticated;
