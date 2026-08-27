-- Restore proportional holding shares in member expense detail lists.
-- Holding expenses are collective; each member sees their ownership percentage,
-- while explicitly assigned expenses remain limited to that member's assignment.
create or replace function public.list_member_expenses(target_org uuid)
returns table (
  id uuid,
  description text,
  category text,
  value numeric,
  expense_date date,
  expense_kind text,
  responsible text,
  building_id uuid,
  is_holding_expense boolean,
  member_share numeric
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
   where om.organization_id = target_org
     and om.user_id = auth.uid();

  if viewer_role is null then raise exception 'not_authorized'; end if;
  if viewer_role not in ('viewer', 'owner', 'admin', 'manager') then
    raise exception 'member_endpoint_only';
  end if;

  select coalesce(sum(owner.ownership_percentage), 0)
    into ownership_total
    from (
      select coalesce(om.ownership_percentage, 0) as ownership_percentage
        from public.organization_members om
       where om.organization_id = target_org
      union all
      select coalesce(oc.ownership_percentage, 0)
        from public.organization_contacts oc
       where oc.organization_id = target_org
    ) owner;

  member_weight := case
    when ownership_total > 0 then viewer_ownership / ownership_total
    else 0
  end;

  return query
  select
    e.id,
    e.description,
    coalesce(e.category, 'Operacional'),
    case
      when assignment.is_holding then round(e.value * member_weight, 2)
      when assignment.has_assignments then assignment.own_share
      when e.responsible_user_id = auth.uid() then e.value
      else 0
    end,
    e.expense_date,
    coalesce(e.expense_kind, 'recurring')::text,
    case when assignment.is_holding then 'Holding' else 'Sua responsabilidade' end,
    e.building_id,
    assignment.is_holding,
    case
      when assignment.is_holding then round(e.value * member_weight, 2)
      when assignment.has_assignments then assignment.own_share
      when e.responsible_user_id = auth.uid() then e.value
      else 0
    end
  from public.expenses e
  cross join lateral (
    select
      exists (
        select 1 from public.expense_responsibilities er
         where er.organization_id = target_org and er.expense_id = e.id
      ) as has_assignments,
      coalesce((
        select sum(er.share_percentage) * e.value / 100
          from public.expense_responsibilities er
         where er.organization_id = target_org
           and er.expense_id = e.id
           and er.user_id = auth.uid()
      ), 0) as own_share,
      not exists (
        select 1 from public.expense_responsibilities er
         where er.organization_id = target_org and er.expense_id = e.id
      )
      and e.responsible_user_id is null
      and e.responsible_contact_id is null as is_holding
  ) assignment
  where e.organization_id = target_org
    and (
      assignment.is_holding
      or exists (
        select 1 from public.expense_responsibilities er
         where er.organization_id = target_org
           and er.expense_id = e.id
           and er.user_id = auth.uid()
      )
      or (not assignment.has_assignments and e.responsible_user_id = auth.uid())
    )
  order by e.expense_date desc, e.created_at desc;
end;
$$;

-- The same rule applies when a manager previews a contact member who has no login.
create or replace function public.list_contact_member_expenses(target_org uuid, target_member_contact uuid)
returns table (
  id uuid,
  description text,
  category text,
  value numeric,
  expense_date date,
  expense_kind text,
  responsible text,
  building_id uuid,
  is_holding_expense boolean,
  member_share numeric
)
language plpgsql stable security definer set search_path = public as $$
declare
  viewer_ownership numeric := 0;
  ownership_total numeric := 0;
  member_weight numeric := 0;
begin
  if not public.is_org_member(target_org, 'manager') then
    raise exception 'not_authorized';
  end if;
  if not exists (
    select 1 from public.organization_contacts oc
     where oc.id = target_member_contact and oc.organization_id = target_org
  ) then
    raise exception 'member_contact_not_found';
  end if;

  select coalesce(oc.ownership_percentage, 0)
    into viewer_ownership
    from public.organization_contacts oc
   where oc.id = target_member_contact
     and oc.organization_id = target_org;

  select coalesce(sum(owner.ownership_percentage), 0)
    into ownership_total
    from (
      select coalesce(om.ownership_percentage, 0) as ownership_percentage
        from public.organization_members om
       where om.organization_id = target_org
      union all
      select coalesce(oc.ownership_percentage, 0)
        from public.organization_contacts oc
       where oc.organization_id = target_org
    ) owner;

  member_weight := case
    when ownership_total > 0 then viewer_ownership / ownership_total
    else 0
  end;

  return query
  select
    e.id,
    coalesce(e.description, 'Despesa'),
    coalesce(e.category, 'Operacional'),
    case
      when assignment.is_holding then round(e.value * member_weight, 2)
      when assignment.has_assignments then assignment.own_share
      when e.responsible_contact_id = target_member_contact then e.value
      else 0
    end,
    e.expense_date,
    coalesce(e.expense_kind, 'recurring')::text,
    case when assignment.is_holding then 'Holding' else 'Sua responsabilidade' end,
    e.building_id,
    assignment.is_holding,
    case
      when assignment.is_holding then round(e.value * member_weight, 2)
      when assignment.has_assignments then assignment.own_share
      when e.responsible_contact_id = target_member_contact then e.value
      else 0
    end
  from public.expenses e
  cross join lateral (
    select
      exists (
        select 1 from public.expense_responsibilities er
         where er.organization_id = target_org and er.expense_id = e.id
      ) as has_assignments,
      coalesce((
        select sum(er.share_percentage) * e.value / 100
          from public.expense_responsibilities er
         where er.organization_id = target_org
           and er.expense_id = e.id
           and er.contact_id = target_member_contact
      ), 0) as own_share,
      not exists (
        select 1 from public.expense_responsibilities er
         where er.organization_id = target_org and er.expense_id = e.id
      )
      and e.responsible_user_id is null
      and e.responsible_contact_id is null as is_holding
  ) assignment
  where e.organization_id = target_org
    and (
      assignment.is_holding
      or exists (
        select 1 from public.expense_responsibilities er
         where er.organization_id = target_org
           and er.expense_id = e.id
           and er.contact_id = target_member_contact
      )
      or (not assignment.has_assignments and e.responsible_contact_id = target_member_contact)
    )
  order by e.expense_date desc, e.created_at desc;
end;
$$;

revoke all on function public.list_member_expenses(uuid) from public, anon;
grant execute on function public.list_member_expenses(uuid) to authenticated;
revoke all on function public.list_contact_member_expenses(uuid, uuid) from public, anon;
grant execute on function public.list_contact_member_expenses(uuid, uuid) to authenticated;
