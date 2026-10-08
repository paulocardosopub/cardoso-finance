-- Permite que membros consultem apenas o histórico operacional criado por funcionárias.
-- Créditos individuais, despesas e demais lançamentos continuam fora desta consulta.
create or replace function public.list_member_employee_activity(target_org uuid)
returns table (
  id uuid,
  event_type text,
  amount numeric,
  description text,
  occurred_at timestamptz,
  created_by uuid,
  source_payment_id uuid,
  actor_name text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_org_member(target_org) then
    raise exception 'not_authorized';
  end if;

  return query
  select
    h.id,
    h.event_type,
    h.amount,
    h.description,
    h.occurred_at,
    h.created_by,
    h.source_payment_id,
    coalesce(nullif(p.full_name, ''), split_part(u.email, '@', 1), 'Funcionária')
  from public.financial_history h
  join public.organization_members employee_member
    on employee_member.organization_id = h.organization_id
   and employee_member.user_id = h.created_by
   and employee_member.role = 'employee'
  left join public.profiles p on p.id = h.created_by
  left join auth.users u on u.id = h.created_by
  where h.organization_id = target_org
    and h.source_payment_id is not null
  order by h.occurred_at desc
  limit 30;
end;
$$;

revoke all on function public.list_member_employee_activity(uuid) from public, anon;
grant execute on function public.list_member_employee_activity(uuid) to authenticated;
