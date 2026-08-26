-- A despesa da Holding é coletiva: cada membro vê apenas sua parcela de participação.
create or replace function public.list_member_expenses(target_org uuid)
returns table (
  id uuid, description text, category text, value numeric, expense_date date,
  expense_kind text, responsible text, building_id uuid,
  is_holding_expense boolean, member_share numeric
)
language plpgsql stable security definer set search_path = public as $$
declare
  viewer_role public.member_role;
  viewer_ownership numeric := 0;
  ownership_total numeric := 0;
  member_weight numeric := 0;
begin
  select om.role, coalesce(om.ownership_percentage, 0)
    into viewer_role, viewer_ownership
    from public.organization_members om
   where om.organization_id = target_org and om.user_id = auth.uid();
  if viewer_role is null then raise exception 'not_authorized'; end if;
  if viewer_role not in ('viewer', 'owner', 'admin', 'manager') then raise exception 'member_endpoint_only'; end if;
  select coalesce(sum(ownership_percentage), 0) into ownership_total
    from (select ownership_percentage from public.organization_members where organization_id = target_org
          union all select ownership_percentage from public.organization_contacts where organization_id = target_org) owners;
  member_weight := case when ownership_total > 0 then viewer_ownership / ownership_total else 0 end;
  return query
  select e.id, e.description, coalesce(e.category, 'Operacional'),
    case when assignment.is_holding then e.value * member_weight
         when assignment.has_assignments then assignment.own_share
         when e.responsible_user_id = auth.uid() then e.value else 0 end,
    e.expense_date, coalesce(e.expense_kind, 'recurring')::text,
    case when assignment.is_holding then 'Holding' else 'Sua responsabilidade' end,
    e.building_id, assignment.is_holding,
    case when assignment.is_holding then e.value * member_weight
         when assignment.has_assignments then assignment.own_share
         when e.responsible_user_id = auth.uid() then e.value else 0 end
  from public.expenses e
  cross join lateral (
    select exists (select 1 from public.expense_responsibilities er where er.organization_id = target_org and er.expense_id = e.id) as has_assignments,
      coalesce((select sum(er.share_percentage) * e.value / 100 from public.expense_responsibilities er where er.organization_id = target_org and er.expense_id = e.id and er.user_id = auth.uid()), 0) as own_share,
      not exists (select 1 from public.expense_responsibilities er where er.organization_id = target_org and er.expense_id = e.id)
        and e.responsible_user_id is null and e.responsible_contact_id is null as is_holding
  ) assignment
  where e.organization_id = target_org
    and (assignment.is_holding or exists (select 1 from public.expense_responsibilities er where er.organization_id = target_org and er.expense_id = e.id and er.user_id = auth.uid())
      or (not assignment.has_assignments and e.responsible_user_id = auth.uid()))
  order by e.expense_date desc, e.created_at desc;
end;
$$;
revoke all on function public.list_member_expenses(uuid) from public, anon;
grant execute on function public.list_member_expenses(uuid) to authenticated;
