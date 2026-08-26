-- A receita mensal do membro considera somente aluguéis confirmados como pagos
-- na competência e detalha o total por prédio.
create or replace function public.get_member_revenue_summary(target_org uuid, target_competence date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  viewer_role public.member_role;
  viewer_ownership numeric := 0;
  ownership_total numeric := 0;
  member_weight numeric := 0;
  month_start date := date_trunc('month', target_competence)::date;
  next_month date := (date_trunc('month', target_competence) + interval '1 month')::date;
  month_end date := (date_trunc('month', target_competence) + interval '1 month - 1 day')::date;
  rental_income numeric := 0;
  individual_credits numeric := 0;
  own_expenses numeric := 0;
  holding_expenses numeric := 0;
  rental_credits jsonb := '[]'::jsonb;
begin
  select role, coalesce(ownership_percentage, 0) into viewer_role, viewer_ownership
    from public.organization_members where organization_id = target_org and user_id = auth.uid();
  if viewer_role is null then raise exception 'not_authorized'; end if;
  if viewer_role not in ('viewer', 'owner', 'admin', 'manager') then raise exception 'member_endpoint_only'; end if;
  select coalesce(sum(ownership_percentage), 0) into ownership_total from public.organization_members where organization_id = target_org;
  select ownership_total + coalesce(sum(ownership_percentage), 0) into ownership_total from public.organization_contacts where organization_id = target_org;
  member_weight := case when ownership_total > 0 then viewer_ownership / ownership_total else 0 end;

  select coalesce(sum(round(r.value * member_weight, 2)), 0) into rental_income
    from public.revenues r join public.lease_payments p on p.id = r.source_payment_id
   where r.organization_id = target_org and r.origin = 'lease_payment' and p.status = 'paid'
     and coalesce(r.competence, r.revenue_date) >= month_start and coalesce(r.competence, r.revenue_date) < next_month;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'description', x.description, 'value', round(x.gross_value * member_weight, 2), 'type', 'Aluguel') order by x.description), '[]'::jsonb) into rental_credits
    from (select b.id, coalesce(a.name, 'Imóvel') as description, sum(r.value) as gross_value
            from public.revenues r join public.lease_payments p on p.id = r.source_payment_id
            join public.leases l on l.id = p.lease_id join public.property_units u on u.id = l.unit_id
            join public.buildings b on b.id = u.building_id left join public.assets a on a.id = b.asset_id
           where r.organization_id = target_org and r.origin = 'lease_payment' and p.status = 'paid'
             and coalesce(r.competence, r.revenue_date) >= month_start and coalesce(r.competence, r.revenue_date) < next_month
           group by b.id, a.name) x;
  select coalesce(sum(r.value), 0) into individual_credits from public.revenues r
   where r.organization_id = target_org and r.beneficiary_user_id = auth.uid()
     and ((coalesce(r.recurring, false) and r.revenue_date <= month_end) or (not coalesce(r.recurring, false) and coalesce(r.competence, r.revenue_date) >= month_start and coalesce(r.competence, r.revenue_date) < next_month));
  select coalesce(sum(case when exists (select 1 from public.expense_responsibilities er where er.organization_id = target_org and er.expense_id = e.id) then coalesce((select sum(er.share_percentage) from public.expense_responsibilities er where er.organization_id = target_org and er.expense_id = e.id and er.user_id = auth.uid()), 0) * e.value / 100 when e.responsible_user_id = auth.uid() then e.value else 0 end), 0) into own_expenses from public.expenses e where e.organization_id = target_org and (coalesce(e.expense_kind, 'recurring') <> 'one_time' or (e.expense_date >= month_start and e.expense_date < next_month));
  select coalesce(sum(e.value * member_weight), 0) into holding_expenses from public.expenses e where e.organization_id = target_org and (coalesce(e.expense_kind, 'recurring') <> 'one_time' or (e.expense_date >= month_start and e.expense_date < next_month)) and e.responsible_user_id is null and e.responsible_contact_id is null and not exists (select 1 from public.expense_responsibilities er where er.organization_id = target_org and er.expense_id = e.id);
  return jsonb_build_object('month', month_start, 'ownershipPercentage', viewer_ownership, 'rentalIncome', rental_income, 'rentalCredits', rental_credits, 'individualCredits', individual_credits, 'ownExpenses', own_expenses, 'holdingExpenses', holding_expenses, 'netTotal', rental_income + individual_credits - own_expenses - holding_expenses, 'credits', '[]'::jsonb, 'expenses', '[]'::jsonb);
end;
$$;
revoke all on function public.get_member_revenue_summary(uuid, date) from public, anon;
grant execute on function public.get_member_revenue_summary(uuid, date) to authenticated;
