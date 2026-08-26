-- Créditos individuais são pagamentos/distribuições para pessoas, não entradas da holding.
alter table public.financial_history
  add column if not exists source_revenue_id uuid references public.revenues(id) on delete set null;
create index if not exists financial_history_source_revenue_idx
  on public.financial_history(source_revenue_id)
  where source_revenue_id is not null;

-- Corrige lançamentos individuais criados pela versão anterior da função.
update public.financial_history
set event_type = 'debit'
where event_type = 'credit'
  and description like 'Crédito individual · %';

create or replace function public.create_individual_credit(
  target_org uuid,
  target_value numeric,
  target_competence date,
  target_description text,
  target_beneficiary_user uuid default null,
  target_beneficiary_contact uuid default null,
  target_recurring boolean default false
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  credit_id uuid;
  beneficiary_name text;
  competence_date date := date_trunc('month', target_competence)::date;
begin
  if not public.is_org_member(target_org, 'manager') then raise exception 'not_authorized'; end if;
  if target_value is null or target_value <= 0 then raise exception 'invalid_credit_value'; end if;
  if nullif(trim(coalesce(target_description, '')), '') is null then raise exception 'invalid_credit_description'; end if;
  if (target_beneficiary_user is null) = (target_beneficiary_contact is null) then raise exception 'invalid_beneficiary'; end if;
  if target_beneficiary_user is not null then
    select coalesce(nullif(p.full_name, ''), split_part(u.email, '@', 1), 'Membro') into beneficiary_name
      from public.organization_members m join auth.users u on u.id = m.user_id left join public.profiles p on p.id = m.user_id
      where m.organization_id = target_org and m.user_id = target_beneficiary_user;
  else
    select c.full_name into beneficiary_name from public.organization_contacts c where c.organization_id = target_org and c.id = target_beneficiary_contact;
  end if;
  if beneficiary_name is null then raise exception 'beneficiary_not_found'; end if;
  insert into public.revenues(organization_id, value, revenue_date, competence, category, description, origin, notes, created_by, beneficiary_user_id, beneficiary_contact_id, recurring)
  values(target_org, round(target_value, 2), competence_date, competence_date, 'other', left(trim(target_description), 240), 'individual_benefit', 'Pagamento individual para ' || beneficiary_name, auth.uid(), target_beneficiary_user, target_beneficiary_contact, coalesce(target_recurring, false))
  returning id into credit_id;
  insert into public.financial_history(organization_id, event_type, amount, description, source_revenue_id, created_by)
  values(target_org, 'debit', round(target_value, 2), 'Pagamento individual · ' || beneficiary_name || ' · ' || left(trim(target_description), 240), credit_id, auth.uid());
  return jsonb_build_object('id', credit_id, 'beneficiary', beneficiary_name, 'value', round(target_value, 2), 'competence', competence_date, 'recurring', coalesce(target_recurring, false));
end;
$$;
revoke all on function public.create_individual_credit(uuid, numeric, date, text, uuid, uuid, boolean) from public, anon;
grant execute on function public.create_individual_credit(uuid, numeric, date, text, uuid, uuid, boolean) to authenticated;

create or replace function public.update_credit(
  target_org uuid,
  target_credit uuid,
  target_value numeric,
  target_description text,
  target_competence date default null,
  target_recurring boolean default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  credit_row public.revenues%rowtype;
  new_competence date;
begin
  if not public.is_org_member(target_org, 'manager') then raise exception 'not_authorized'; end if;
  if target_value is null or target_value <= 0 then raise exception 'invalid_credit_value'; end if;
  if nullif(trim(coalesce(target_description, '')), '') is null then raise exception 'invalid_credit_description'; end if;
  select r.* into credit_row from public.revenues r where r.id = target_credit and r.organization_id = target_org for update;
  if credit_row.id is null then raise exception 'credit_not_found'; end if;
  new_competence := coalesce(date_trunc('month', target_competence)::date, credit_row.competence, credit_row.revenue_date);

  if credit_row.source_payment_id is not null then
    if target_competence is not null and date_trunc('month', target_competence)::date <> credit_row.competence then raise exception 'automatic_credit_competence_locked'; end if;
    update public.revenues set value = round(target_value, 2), description = left(trim(target_description), 240), updated_at = timezone('utc', now()) where id = credit_row.id;
    update public.lease_payments set received_amount = round(target_value, 2), expected_amount = round(target_value, 2), updated_at = timezone('utc', now()) where id = credit_row.source_payment_id;
    update public.financial_history set amount = round(target_value, 2), description = left(trim(target_description), 240) where source_payment_id = credit_row.source_payment_id and event_type = 'credit';
  elsif credit_row.source_sale_id is not null then
    update public.revenues set value = round(target_value, 2), description = left(trim(target_description), 240), updated_at = timezone('utc', now()) where id = credit_row.id;
    update public.sales set sale_price = round(target_value, 2), notes = coalesce(notes, '') where id = credit_row.source_sale_id and organization_id = target_org;
    update public.financial_history set amount = round(target_value, 2), description = left(trim(target_description), 240) where source_sale_id = credit_row.source_sale_id and event_type = 'credit';
  else
    update public.revenues set value = round(target_value, 2), description = left(trim(target_description), 240), competence = new_competence, revenue_date = new_competence, recurring = coalesce(target_recurring, recurring), updated_at = timezone('utc', now()) where id = credit_row.id;
    update public.financial_history set amount = round(target_value, 2), description = left(trim(target_description), 240) where source_revenue_id = credit_row.id and event_type = 'debit';
  end if;
  return jsonb_build_object('id', credit_row.id, 'value', round(target_value, 2), 'competence', new_competence, 'origin', credit_row.origin);
end;
$$;
revoke all on function public.update_credit(uuid, uuid, numeric, text, date, boolean) from public, anon;
grant execute on function public.update_credit(uuid, uuid, numeric, text, date, boolean) to authenticated;

create or replace function public.delete_credit(target_org uuid, target_credit uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  credit_row public.revenues%rowtype;
  payment_row public.lease_payments%rowtype;
  label text;
begin
  if not public.is_org_member(target_org, 'manager') then raise exception 'not_authorized'; end if;
  select r.* into credit_row from public.revenues r where r.id = target_credit and r.organization_id = target_org for update;
  if credit_row.id is null then raise exception 'credit_not_found'; end if;
  label := coalesce(credit_row.description, 'Crédito');
  if credit_row.source_payment_id is not null then
    select * into payment_row from public.lease_payments where id = credit_row.source_payment_id and organization_id = target_org for update;
    if payment_row.id is not null then
      update public.lease_payments set received_amount = 0, received_at = null, status = 'pending'::public.payment_status, updated_at = timezone('utc', now()) where id = payment_row.id;
      delete from public.financial_history where source_payment_id = payment_row.id;
      insert into public.financial_history(organization_id, event_type, amount, description, source_payment_id, created_by)
      values(target_org, 'debit', credit_row.value, 'Estorno · ' || label, payment_row.id, auth.uid());
    end if;
  elsif credit_row.source_sale_id is not null then
    raise exception 'automatic_sale_credit_delete_not_allowed';
  else
    insert into public.financial_history(organization_id, event_type, amount, description, created_by)
    values(target_org, 'credit', credit_row.value, 'Estorno de pagamento individual · ' || label, auth.uid());
    delete from public.financial_history where source_revenue_id = credit_row.id;
  end if;
  delete from public.revenues where id = credit_row.id and organization_id = target_org;
  return jsonb_build_object('id', credit_row.id, 'deleted', true, 'origin', credit_row.origin);
end;
$$;
revoke all on function public.delete_credit(uuid, uuid) from public, anon;
grant execute on function public.delete_credit(uuid, uuid) to authenticated;
