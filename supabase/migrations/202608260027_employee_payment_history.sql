-- Employee-only history of real payment confirmations.
-- The source revenue is created atomically by the payment RPC, so no
-- synthetic rows are generated for pending or unconfirmed months.
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
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_operate_properties(target_org) then
    raise exception 'not_authorized';
  end if;

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
    and r.created_by = auth.uid()
    and (p.id is null or p.status = 'paid')
  order by coalesce(p.received_at, r.revenue_date) desc, r.created_at desc;
end;
$$;

revoke all on function public.list_employee_payment_history(uuid) from public, anon;
grant execute on function public.list_employee_payment_history(uuid) to authenticated;
