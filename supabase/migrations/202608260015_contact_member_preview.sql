-- Permite que gestores revisem também contatos/membros ainda sem login.
-- Contatos nunca são tratados como usuários autenticados: somente gestores
-- podem chamar estas funções e o contato é sempre validado na holding.
create or replace function public.get_contact_member_portfolio(target_org uuid, target_member_contact uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  viewer_ownership numeric := 0;
  ownership_total numeric := 0;
  member_weight numeric := 0;
  settings public.member_visibility_settings%rowtype;
  result jsonb;
begin
  if not public.is_org_member(target_org, 'manager') then raise exception 'not_authorized'; end if;
  select coalesce(c.ownership_percentage, 0) into viewer_ownership
    from public.organization_contacts c where c.id = target_member_contact and c.organization_id = target_org;
  if not found then raise exception 'member_contact_not_found'; end if;
  select coalesce(sum(ownership_percentage), 0) into ownership_total from public.organization_members where organization_id = target_org;
  select ownership_total + coalesce(sum(ownership_percentage), 0) into ownership_total from public.organization_contacts where organization_id = target_org;
  member_weight := case when ownership_total > 0 then viewer_ownership / ownership_total else 0 end;
  select * into settings from public.member_visibility_settings where organization_id = target_org;
  if not found then
    settings.show_total_assets := true; settings.show_property_values := true; settings.show_rental_info := true;
    settings.show_property_status := true; settings.show_photos := true; settings.show_locations := true;
    settings.show_map := true; settings.show_documents := true; settings.show_ownership_by_beneficiary := false;
  end if;
  with monthly_unit_rents as (
    select u.id unit_id, u.building_id,
      coalesce((select l.current_rent from public.leases l where l.organization_id=target_org and l.unit_id=u.id and l.status in ('active','ending') order by l.updated_at desc limit 1),u.potential_rent,0) gross_rent
      from public.property_units u where u.organization_id=target_org
  ), unit_rows as (
    select u.building_id, jsonb_build_object('id',u.id,'code',u.code,'type',u.unit_type,'quantity',u.quantity,
      'status',case when settings.show_property_status then u.status::text else null end,
      'rent',case when settings.show_rental_info then round(r.gross_rent*member_weight,2) else 0 end) item
      from public.property_units u join monthly_unit_rents r on r.unit_id=u.id where u.organization_id=target_org
  ), units_by_building as (select building_id,jsonb_agg(item order by item->>'code') items from unit_rows group by building_id),
  building_rows as (
    select jsonb_build_object('id',coalesce(b.source_key,b.id::text),'db_id',b.id,'asset_id',a.id,'source_key',b.source_key,
      'name',a.name,'description',b.description,'address',case when settings.show_locations then b.address else '' end,
      'city',case when settings.show_locations or settings.show_map then b.city else '' end,
      'state',case when settings.show_locations or settings.show_map then b.state else '' end,
      'postal_code',case when settings.show_locations then b.postal_code else null end,
      'latitude',case when settings.show_map then b.latitude else null end,'longitude',case when settings.show_map then b.longitude else null end,
      'value',case when settings.show_property_values then round(b.current_value*member_weight,2) else 0 end,
      'status',case when settings.show_property_status then b.status::text else null end,'total_units',b.total_units,'units',coalesce(ub.items,'[]'::jsonb)) item
      from public.buildings b join public.assets a on a.id=b.asset_id and a.organization_id=target_org left join units_by_building ub on ub.building_id=b.id
      where b.organization_id=target_org and b.status<>'sold'
  )
  select jsonb_build_object(
    'settings',jsonb_build_object('showTotalAssets',settings.show_total_assets,'showPropertyValues',settings.show_property_values,'showRentalInfo',settings.show_rental_info,'showPropertyStatus',settings.show_property_status,'showPhotos',settings.show_photos,'showLocations',settings.show_locations,'showMap',settings.show_map,'showDocuments',settings.show_documents,'showOwnershipByBeneficiary',settings.show_ownership_by_beneficiary),
    'summary',jsonb_build_object('totalValue',case when settings.show_total_assets then coalesce((select sum(round(current_value*member_weight,2)) from public.buildings where organization_id=target_org and status<>'sold'),0) else 0 end,'holdingTotalValue',coalesce((select sum(current_value) from public.buildings where organization_id=target_org and status<>'sold'),0),'totalBuildings',(select count(*) from public.buildings where organization_id=target_org and status<>'sold'),'totalUnits',coalesce((select sum(u.quantity) from public.property_units u join public.buildings b on b.id=u.building_id where u.organization_id=target_org and b.status<>'sold'),0),'grossRent',case when settings.show_rental_info then coalesce((select sum(round(gross_rent*member_weight,2)) from monthly_unit_rents r join public.buildings b on b.id=r.building_id where b.status<>'sold'),0) else 0 end,'totalRent',case when settings.show_rental_info then coalesce((select sum(round(gross_rent*member_weight,2)) from monthly_unit_rents r join public.buildings b on b.id=r.building_id where b.status<>'sold'),0) else 0 end,'monthlyExpenses',0,'ownershipPercentage',viewer_ownership),
    'buildings',coalesce((select jsonb_agg(item order by item->>'name') from building_rows),'[]'::jsonb),'ownership','[]'::jsonb) into result;
  return result;
end; $$;

create or replace function public.get_contact_member_revenue_summary(target_org uuid, target_competence date, target_member_contact uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare viewer_ownership numeric:=0; ownership_total numeric:=0; member_weight numeric:=0; month_start date:=date_trunc('month',target_competence)::date; next_month date:=(date_trunc('month',target_competence)+interval '1 month')::date; month_end date:=(date_trunc('month',target_competence)+interval '1 month - 1 day')::date; rental_income numeric:=0; individual_credits numeric:=0; own_expenses numeric:=0; holding_expenses numeric:=0; rental_credits jsonb:='[]'::jsonb;
begin
  if not public.is_org_member(target_org,'manager') then raise exception 'not_authorized'; end if;
  select coalesce(c.ownership_percentage,0) into viewer_ownership from public.organization_contacts c where c.id=target_member_contact and c.organization_id=target_org;
  if not found then raise exception 'member_contact_not_found'; end if;
  select coalesce(sum(ownership_percentage),0) into ownership_total from public.organization_members where organization_id=target_org;
  select ownership_total+coalesce(sum(ownership_percentage),0) into ownership_total from public.organization_contacts where organization_id=target_org;
  member_weight:=case when ownership_total>0 then viewer_ownership/ownership_total else 0 end;
  if month_start>=date '2026-08-01' then
    select coalesce(sum(round(r.value*member_weight,2)),0) into rental_income from public.revenues r join public.lease_payments p on p.id=r.source_payment_id where r.organization_id=target_org and r.origin='lease_payment' and p.status='paid' and coalesce(r.competence,r.revenue_date)>=month_start and coalesce(r.competence,r.revenue_date)<next_month;
    select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'description',x.description,'value',round(x.gross_value*member_weight,2),'type','Aluguel') order by x.description),'[]'::jsonb) into rental_credits from (select b.id,coalesce(a.name,'Imóvel') description,sum(r.value) gross_value from public.revenues r join public.lease_payments p on p.id=r.source_payment_id join public.leases l on l.id=p.lease_id join public.property_units u on u.id=l.unit_id join public.buildings b on b.id=u.building_id left join public.assets a on a.id=b.asset_id where r.organization_id=target_org and r.origin='lease_payment' and p.status='paid' and coalesce(r.competence,r.revenue_date)>=month_start and coalesce(r.competence,r.revenue_date)<next_month group by b.id,a.name) x;
  end if;
  select coalesce(sum(r.value),0) into individual_credits from public.revenues r where r.organization_id=target_org and r.beneficiary_contact_id=target_member_contact and ((coalesce(r.recurring,false) and r.revenue_date<=month_end) or (not coalesce(r.recurring,false) and coalesce(r.competence,r.revenue_date)>=month_start and coalesce(r.competence,r.revenue_date)<next_month));
  select coalesce(sum(case when exists(select 1 from public.expense_responsibilities er where er.organization_id=target_org and er.expense_id=e.id) then coalesce((select sum(er.share_percentage) from public.expense_responsibilities er where er.organization_id=target_org and er.expense_id=e.id and er.contact_id=target_member_contact),0)*e.value/100 when e.responsible_contact_id=target_member_contact then e.value else 0 end),0) into own_expenses from public.expenses e where e.organization_id=target_org and (coalesce(e.expense_kind,'recurring')<>'one_time' or (e.expense_date>=month_start and e.expense_date<next_month));
  select coalesce(sum(e.value*member_weight),0) into holding_expenses from public.expenses e where e.organization_id=target_org and (coalesce(e.expense_kind,'recurring')<>'one_time' or (e.expense_date>=month_start and e.expense_date<next_month)) and e.responsible_user_id is null and e.responsible_contact_id is null and not exists(select 1 from public.expense_responsibilities er where er.organization_id=target_org and er.expense_id=e.id);
  return jsonb_build_object('month',month_start,'ownershipPercentage',viewer_ownership,'rentalIncome',rental_income,'rentalCredits',rental_credits,'individualCredits',individual_credits,'ownExpenses',own_expenses,'holdingExpenses',holding_expenses,'netTotal',rental_income+individual_credits-own_expenses-holding_expenses,'credits','[]'::jsonb,'expenses','[]'::jsonb);
end; $$;

create or replace function public.list_contact_member_credits(target_org uuid, target_competence date, target_member_contact uuid)
returns table(id uuid,value numeric,revenue_date date,competence date,description text,origin text,recurring boolean) language plpgsql stable security definer set search_path=public as $$
declare month_start date:=date_trunc('month',target_competence)::date; next_month date:=(date_trunc('month',target_competence)+interval '1 month')::date; month_end date:=(date_trunc('month',target_competence)+interval '1 month - 1 day')::date;
begin
  if not public.is_org_member(target_org,'manager') then raise exception 'not_authorized'; end if;
  if not exists(select 1 from public.organization_contacts where id=target_member_contact and organization_id=target_org) then raise exception 'member_contact_not_found'; end if;
  return query select r.id,r.value,r.revenue_date,coalesce(r.competence,r.revenue_date),r.description,r.origin::text,coalesce(r.recurring,false) from public.revenues r where r.organization_id=target_org and r.beneficiary_contact_id=target_member_contact and ((coalesce(r.recurring,false) and r.revenue_date<=month_end) or (not coalesce(r.recurring,false) and coalesce(r.competence,r.revenue_date)>=month_start and coalesce(r.competence,r.revenue_date)<next_month)) order by coalesce(r.competence,r.revenue_date) desc,r.created_at desc;
end; $$;

create or replace function public.list_contact_member_expenses(target_org uuid, target_member_contact uuid)
returns table(id uuid,description text,category text,value numeric,expense_date date,expense_kind text,responsible text,building_id uuid,is_holding_expense boolean,member_share numeric) language plpgsql stable security definer set search_path=public as $$
begin
  if not public.is_org_member(target_org,'manager') then raise exception 'not_authorized'; end if;
  if not exists(select 1 from public.organization_contacts where id=target_member_contact and organization_id=target_org) then raise exception 'member_contact_not_found'; end if;
  return query select e.id,e.description,coalesce(e.category,'Operacional'),case when a.is_holding then e.value when a.has_assignments then a.own_share when e.responsible_contact_id=target_member_contact then e.value else 0 end,e.expense_date,coalesce(e.expense_kind,'recurring')::text,case when a.is_holding then 'Holding' else 'Sua responsabilidade' end,e.building_id,a.is_holding,case when a.is_holding then e.value when a.has_assignments then a.own_share when e.responsible_contact_id=target_member_contact then e.value else 0 end from public.expenses e cross join lateral (select exists(select 1 from public.expense_responsibilities er where er.organization_id=target_org and er.expense_id=e.id) has_assignments,coalesce((select sum(er.share_percentage)*e.value/100 from public.expense_responsibilities er where er.organization_id=target_org and er.expense_id=e.id and er.contact_id=target_member_contact),0) own_share,not exists(select 1 from public.expense_responsibilities er where er.organization_id=target_org and er.expense_id=e.id) and e.responsible_user_id is null and e.responsible_contact_id is null is_holding) a where e.organization_id=target_org and (a.is_holding or exists(select 1 from public.expense_responsibilities er where er.organization_id=target_org and er.expense_id=e.id and er.contact_id=target_member_contact) or (not a.has_assignments and e.responsible_contact_id=target_member_contact)) order by e.expense_date desc,e.created_at desc;
end; $$;

revoke all on function public.get_contact_member_portfolio(uuid,uuid) from public,anon; grant execute on function public.get_contact_member_portfolio(uuid,uuid) to authenticated;
revoke all on function public.get_contact_member_revenue_summary(uuid,date,uuid) from public,anon; grant execute on function public.get_contact_member_revenue_summary(uuid,date,uuid) to authenticated;
revoke all on function public.list_contact_member_credits(uuid,date,uuid) from public,anon; grant execute on function public.list_contact_member_credits(uuid,date,uuid) to authenticated;
revoke all on function public.list_contact_member_expenses(uuid,uuid) from public,anon; grant execute on function public.list_contact_member_expenses(uuid,uuid) to authenticated;
