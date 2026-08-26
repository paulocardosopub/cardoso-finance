-- Despesas operacionais variáveis lançadas pela funcionária.
alter table public.expenses
  add column if not exists created_role text not null default 'management';

create index if not exists expenses_org_created_role_idx
  on public.expenses(organization_id, created_role, expense_date desc);

create or replace function public.set_expense_created_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare member_role text;
begin
  select om.role::text into member_role
    from public.organization_members om
   where om.organization_id = new.organization_id
     and om.user_id = coalesce(new.created_by, auth.uid());
  if member_role = 'employee' then
    new.created_role := 'employee';
  elsif coalesce(new.created_role, '') = '' then
    new.created_role := 'management';
  end if;
  return new;
end;
$$;

drop trigger if exists expenses_set_created_role on public.expenses;
create trigger expenses_set_created_role
before insert or update of created_by, organization_id on public.expenses
for each row execute function public.set_expense_created_role();

create or replace function public.create_employee_variable_expense(
  target_org uuid,
  expense_description text,
  expense_value numeric,
  expense_date_value date,
  expense_category text default 'Administração de imóveis',
  expense_building uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare expense_id uuid;
begin
  if not exists (
    select 1 from public.organization_members om
     where om.organization_id = target_org
       and om.user_id = auth.uid()
       and om.role = 'employee'
  ) then raise exception 'not_authorized'; end if;
  if nullif(trim(coalesce(expense_description, '')), '') is null then raise exception 'invalid_description'; end if;
  if expense_value is null or expense_value <= 0 then raise exception 'invalid_value'; end if;
  if expense_date_value is null then raise exception 'invalid_date'; end if;
  if expense_building is not null and not exists (
    select 1 from public.buildings b where b.id = expense_building and b.organization_id = target_org
  ) then raise exception 'building_not_found'; end if;

  insert into public.expenses (
    organization_id, building_id, description, category, value, expense_date,
    competence, recurring, expense_kind, responsible, responsible_user_id,
    responsible_contact_id, created_by, created_role, notes
  ) values (
    target_org, expense_building, trim(expense_description),
    coalesce(nullif(trim(expense_category), ''), 'Administração de imóveis'),
    expense_value, expense_date_value, expense_date_value, false, 'one_time',
    'Holding', null, null, auth.uid(), 'employee', 'Despesa variável operacional'
  ) returning id into expense_id;
  return expense_id;
end;
$$;

revoke all on function public.create_employee_variable_expense(uuid, text, numeric, date, text, uuid) from public, anon;
grant execute on function public.create_employee_variable_expense(uuid, text, numeric, date, text, uuid) to authenticated;
