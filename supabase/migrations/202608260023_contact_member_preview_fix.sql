-- Corrige referências ambíguas nos RPCs de contatos sem login.
create or replace function public.list_contact_member_credits(target_org uuid, target_competence date, target_member_contact uuid)
returns table(id uuid,value numeric,revenue_date date,competence date,description text,origin text,recurring boolean)
language plpgsql stable security definer set search_path=public as $$
declare
  month_start date := date_trunc('month', target_competence)::date;
  next_month date := (date_trunc('month', target_competence) + interval '1 month')::date;
  month_end date := (date_trunc('month', target_competence) + interval '1 month - 1 day')::date;
begin
  if not public.is_org_member(target_org, 'manager') then raise exception 'not_authorized'; end if;
  if not exists (select 1 from public.organization_contacts c where c.id = target_member_contact and c.organization_id = target_org) then raise exception 'member_contact_not_found'; end if;
  return query
    select r.id, r.value, r.revenue_date, coalesce(r.competence, r.revenue_date), r.description, r.origin::text, coalesce(r.recurring, false)
    from public.revenues r
    where r.organization_id = target_org
      and r.beneficiary_contact_id = target_member_contact
      and ((coalesce(r.recurring, false) and r.revenue_date <= month_end)
        or (not coalesce(r.recurring, false) and coalesce(r.competence, r.revenue_date) >= month_start and coalesce(r.competence, r.revenue_date) < next_month))
    order by coalesce(r.competence, r.revenue_date) desc, r.created_at desc;
end;
$$;

create or replace function public.list_contact_member_expenses(target_org uuid, target_member_contact uuid)
returns table(id uuid,description text,category text,value numeric,expense_date date,expense_kind text,responsible text,building_id uuid,is_holding_expense boolean,member_share numeric)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.is_org_member(target_org, 'manager') then raise exception 'not_authorized'; end if;
  if not exists (select 1 from public.organization_contacts c where c.id = target_member_contact and c.organization_id = target_org) then raise exception 'member_contact_not_found'; end if;
  return query
    select e.id,
      coalesce(e.description, 'Despesa'),
      coalesce(e.category, 'Operacional'),
      case when a.is_holding then e.value when a.has_assignments then a.own_share when e.responsible_contact_id = target_member_contact then e.value else 0 end,
      e.expense_date,
      coalesce(e.expense_kind, 'recurring')::text,
      case when a.is_holding then 'Holding' else 'Sua responsabilidade' end,
      e.building_id,
      a.is_holding,
      case when a.is_holding then e.value when a.has_assignments then a.own_share when e.responsible_contact_id = target_member_contact then e.value else 0 end
    from public.expenses e
    cross join lateral (
      select
        exists (select 1 from public.expense_responsibilities er where er.organization_id = target_org and er.expense_id = e.id) as has_assignments,
        coalesce((select sum(er.share_percentage) * e.value / 100 from public.expense_responsibilities er where er.organization_id = target_org and er.expense_id = e.id and er.contact_id = target_member_contact), 0) as own_share,
        not exists (select 1 from public.expense_responsibilities er where er.organization_id = target_org and er.expense_id = e.id)
          and e.responsible_user_id is null and e.responsible_contact_id is null as is_holding
    ) a
    where e.organization_id = target_org
      and (a.is_holding
        or exists (select 1 from public.expense_responsibilities er where er.organization_id = target_org and er.expense_id = e.id and er.contact_id = target_member_contact)
        or (not a.has_assignments and e.responsible_contact_id = target_member_contact))
    order by e.expense_date desc, e.created_at desc;
end;
$$;

revoke all on function public.list_contact_member_credits(uuid,date,uuid) from public, anon;
grant execute on function public.list_contact_member_credits(uuid,date,uuid) to authenticated;
revoke all on function public.list_contact_member_expenses(uuid,uuid) from public, anon;
grant execute on function public.list_contact_member_expenses(uuid,uuid) to authenticated;
