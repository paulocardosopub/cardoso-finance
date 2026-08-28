-- Member dashboard values based on rent actually paid in the selected month.
-- Expenses and individual benefits remain part of the member's net result.
create or replace function public.get_member_paid_revenue_summary(
  target_org uuid,
  target_competence date,
  target_member_user uuid,
  target_member_contact uuid
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  subject_user uuid := coalesce(target_member_user, auth.uid());
  subject_ownership numeric := 0;
  ownership_total numeric := 0;
  member_weight numeric := 0;
  paid_rent numeric := 0;
  expected_rent numeric := 0;
  individual_credits numeric := 0;
  own_expenses numeric := 0;
  holding_expenses numeric := 0;
  month_start date := date_trunc('month', target_competence)::date;
  next_month date := (date_trunc('month', target_competence) + interval '1 month')::date;
  month_end date := (date_trunc('month', target_competence) + interval '1 month - 1 day')::date;
begin
  if target_member_user is not null and target_member_contact is not null then
    raise exception 'invalid_member_target';
  end if;

  if target_member_contact is not null then
    if not public.is_org_member(target_org, 'manager') then raise exception 'not_authorized'; end if;
    select coalesce(c.ownership_percentage, 0) into subject_ownership
      from public.organization_contacts c
     where c.organization_id = target_org and c.id = target_member_contact;
    if not found then raise exception 'member_contact_not_found'; end if;
  else
    select coalesce(m.ownership_percentage, 0) into subject_ownership
      from public.organization_members m
     where m.organization_id = target_org and m.user_id = subject_user
       and m.role in ('viewer', 'owner', 'admin', 'manager');
    if not found then raise exception 'member_not_found'; end if;
    if subject_user <> auth.uid() and not public.is_org_member(target_org, 'manager') then raise exception 'not_authorized'; end if;
  end if;

  select coalesce(sum(m.ownership_percentage), 0) into ownership_total
    from (
      select ownership_percentage from public.organization_members where organization_id = target_org
      union all
      select ownership_percentage from public.organization_contacts where organization_id = target_org
    ) m;
  member_weight := case when ownership_total > 0 then subject_ownership / ownership_total else 0 end;

  select coalesce(sum(round(r.value * member_weight, 2)), 0) into paid_rent
    from public.revenues r
    join public.lease_payments p on p.id = r.source_payment_id
   where r.organization_id = target_org and r.origin = 'lease_payment' and p.status = 'paid'
     and month_start >= date '2026-08-01'
     and coalesce(r.competence, r.revenue_date) >= month_start
     and coalesce(r.competence, r.revenue_date) < next_month;

  select coalesce(sum(round(l.current_rent * member_weight, 2)), 0) into expected_rent
    from public.leases l
    join public.property_units u on u.id = l.unit_id
   where l.organization_id = target_org and l.status in ('active', 'ending')
     and month_start >= date '2026-08-01'
     and l.start_date <= month_end and (l.end_date is null or l.end_date >= month_start);

  if target_member_contact is not null then
    select coalesce(sum(r.value), 0) into individual_credits
      from public.revenues r
     where r.organization_id = target_org and r.beneficiary_contact_id = target_member_contact
       and ((coalesce(r.recurring, false) and r.revenue_date <= month_end)
         or (not coalesce(r.recurring, false) and coalesce(r.competence, r.revenue_date) >= month_start and coalesce(r.competence, r.revenue_date) < next_month));
  else
    select coalesce(sum(r.value), 0) into individual_credits
      from public.revenues r
     where r.organization_id = target_org and r.beneficiary_user_id = subject_user
       and ((coalesce(r.recurring, false) and r.revenue_date <= month_end)
         or (not coalesce(r.recurring, false) and coalesce(r.competence, r.revenue_date) >= month_start and coalesce(r.competence, r.revenue_date) < next_month));
  end if;

  select coalesce(sum(
    case
      when exists (select 1 from public.expense_responsibilities er where er.organization_id = target_org and er.expense_id = e.id)
        then coalesce((select sum(er.share_percentage) from public.expense_responsibilities er where er.organization_id = target_org and er.expense_id = e.id and ((target_member_user is not null and er.user_id = subject_user) or (target_member_contact is not null and er.contact_id = target_member_contact))), 0) * e.value / 100
      when target_member_user is not null and e.responsible_user_id = subject_user then e.value
      when target_member_contact is not null and e.responsible_contact_id = target_member_contact then e.value
      else 0
    end
  ), 0) into own_expenses
    from public.expenses e
   where e.organization_id = target_org
     and (coalesce(e.expense_kind, 'recurring') <> 'one_time' or (e.expense_date >= month_start and e.expense_date < next_month));

  select coalesce(sum(e.value * member_weight), 0) into holding_expenses
    from public.expenses e
   where e.organization_id = target_org
     and (coalesce(e.expense_kind, 'recurring') <> 'one_time' or (e.expense_date >= month_start and e.expense_date < next_month))
     and e.responsible_user_id is null and e.responsible_contact_id is null
     and not exists (select 1 from public.expense_responsibilities er where er.organization_id = target_org and er.expense_id = e.id);

  return jsonb_build_object(
    'month', month_start,
    'expectedRent', expected_rent,
    'paidRent', paid_rent,
    'individualCredits', individual_credits,
    'ownExpenses', own_expenses,
    'holdingExpenses', holding_expenses,
    'netRevenue', paid_rent + individual_credits - own_expenses - holding_expenses
  );
end;
$$;

revoke all on function public.get_member_paid_revenue_summary(uuid, date, uuid, uuid) from public, anon;
grant execute on function public.get_member_paid_revenue_summary(uuid, date, uuid, uuid) to authenticated;
