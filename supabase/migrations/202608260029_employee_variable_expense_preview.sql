-- Allow a manager/administrator previewing a selected employee to perform the
-- same operation, while attributing the expense to that employee.
create or replace function public.create_employee_variable_expense(
  target_org uuid,
  expense_description text,
  expense_value numeric,
  expense_date_value date,
  expense_category text,
  expense_building uuid,
  target_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role public.member_role;
  actor_id uuid := coalesce(target_actor, auth.uid());
  expense_id uuid;
begin
  select om.role into caller_role
    from public.organization_members om
   where om.organization_id = target_org
     and om.user_id = auth.uid();

  if caller_role is null then raise exception 'not_authorized'; end if;
  if caller_role = 'employee' then
    if actor_id <> auth.uid() then raise exception 'not_authorized'; end if;
  elsif caller_role not in ('owner', 'admin', 'manager') then
    raise exception 'not_authorized';
  end if;
  if not exists (
    select 1 from public.organization_members om
     where om.organization_id = target_org
       and om.user_id = actor_id
       and om.role = 'employee'
  ) then raise exception 'employee_not_found'; end if;
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
    'Holding', null, null, actor_id, 'employee', 'Despesa variável operacional'
  ) returning id into expense_id;
  return expense_id;
end;
$$;

create or replace function public.create_employee_variable_expense(
  target_org uuid,
  expense_description text,
  expense_value numeric,
  expense_date_value date,
  expense_category text default 'Administração de imóveis',
  expense_building uuid default null
)
returns uuid
language sql
security definer
set search_path = public as $$
  select public.create_employee_variable_expense(
    target_org, expense_description, expense_value, expense_date_value,
    expense_category, expense_building, null::uuid
  );
$$;

revoke all on function public.create_employee_variable_expense(uuid, text, numeric, date, text, uuid, uuid) from public, anon;
grant execute on function public.create_employee_variable_expense(uuid, text, numeric, date, text, uuid, uuid) to authenticated;
revoke all on function public.create_employee_variable_expense(uuid, text, numeric, date, text, uuid) from public, anon;
grant execute on function public.create_employee_variable_expense(uuid, text, numeric, date, text, uuid) to authenticated;
