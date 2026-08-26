-- Créditos manuais destinados a uma pessoa específica.
alter table public.revenues add column if not exists beneficiary_user_id uuid references auth.users(id) on delete set null;
alter table public.revenues add column if not exists beneficiary_contact_id uuid references public.organization_contacts(id) on delete set null;

create or replace function public.create_individual_credit(
  target_org uuid,
  target_value numeric,
  target_competence date,
  target_description text,
  target_beneficiary_user uuid default null,
  target_beneficiary_contact uuid default null
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
      from public.organization_members m
      join auth.users u on u.id = m.user_id
      left join public.profiles p on p.id = m.user_id
     where m.organization_id = target_org and m.user_id = target_beneficiary_user;
  else
    select c.full_name into beneficiary_name from public.organization_contacts c
     where c.organization_id = target_org and c.id = target_beneficiary_contact;
  end if;
  if beneficiary_name is null then raise exception 'beneficiary_not_found'; end if;

  insert into public.revenues(organization_id, value, revenue_date, competence, category, description, origin, notes, created_by, beneficiary_user_id, beneficiary_contact_id)
  values(target_org, round(target_value, 2), competence_date, competence_date, 'other', left(trim(target_description), 240), 'individual_benefit', 'Crédito individual para ' || beneficiary_name, auth.uid(), target_beneficiary_user, target_beneficiary_contact)
  returning id into credit_id;

  insert into public.financial_history(organization_id, event_type, amount, description, created_by)
  values(target_org, 'credit', round(target_value, 2), 'Crédito individual · ' || beneficiary_name || ' · ' || left(trim(target_description), 240), auth.uid());

  return jsonb_build_object('id', credit_id, 'beneficiary', beneficiary_name, 'value', round(target_value, 2), 'competence', competence_date);
end;
$$;
revoke all on function public.create_individual_credit(uuid, numeric, date, text, uuid, uuid) from public, anon;
grant execute on function public.create_individual_credit(uuid, numeric, date, text, uuid, uuid) to authenticated;
