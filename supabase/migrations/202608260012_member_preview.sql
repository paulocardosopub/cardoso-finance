-- Managers and administrators may preview another organization member's
-- private view. The existing member functions do the calculation; this
-- guarded wrapper evaluates them with the selected member as the subject.
create or replace function public.get_member_portfolio(target_org uuid, target_member_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if target_member_user <> auth.uid() and not public.is_org_member(target_org, 'manager') then raise exception 'not_authorized'; end if;
  if not exists (select 1 from public.organization_members where organization_id = target_org and user_id = target_member_user) then raise exception 'member_not_found'; end if;
  perform set_config('request.jwt.claim.sub', target_member_user::text, true);
  select public.get_member_portfolio(target_org) into result;
  if coalesce((result -> 'settings' ->> 'showTotalAssets')::boolean, true) then
    result := jsonb_set(result, '{summary,holdingTotalValue}', to_jsonb((select coalesce(sum(b.current_value), 0) from public.buildings b where b.organization_id = target_org and b.status <> 'sold')), true);
  else
    result := jsonb_set(result, '{summary,holdingTotalValue}', '0'::jsonb, true);
  end if;
  return result;
end;
$$;
revoke all on function public.get_member_portfolio(uuid, uuid) from public, anon;
grant execute on function public.get_member_portfolio(uuid, uuid) to authenticated;

create or replace function public.get_member_revenue_summary(target_org uuid, target_competence date, target_member_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if target_member_user <> auth.uid() and not public.is_org_member(target_org, 'manager') then raise exception 'not_authorized'; end if;
  if not exists (select 1 from public.organization_members where organization_id = target_org and user_id = target_member_user) then raise exception 'member_not_found'; end if;
  perform set_config('request.jwt.claim.sub', target_member_user::text, true);
  select public.get_member_revenue_summary(target_org, target_competence) into result;
  return result;
end;
$$;
revoke all on function public.get_member_revenue_summary(uuid, date, uuid) from public, anon;
grant execute on function public.get_member_revenue_summary(uuid, date, uuid) to authenticated;

create or replace function public.list_member_credits(target_org uuid, target_competence date, target_member_user uuid)
returns table(id uuid, value numeric, revenue_date date, competence date, description text, origin text, recurring boolean)
language plpgsql security definer set search_path = public as $$
begin
  if target_member_user <> auth.uid() and not public.is_org_member(target_org, 'manager') then raise exception 'not_authorized'; end if;
  if not exists (select 1 from public.organization_members where organization_id = target_org and user_id = target_member_user) then raise exception 'member_not_found'; end if;
  perform set_config('request.jwt.claim.sub', target_member_user::text, true);
  return query select * from public.list_member_credits(target_org, target_competence);
end;
$$;
revoke all on function public.list_member_credits(uuid, date, uuid) from public, anon;
grant execute on function public.list_member_credits(uuid, date, uuid) to authenticated;

create or replace function public.list_member_expenses(target_org uuid, target_member_user uuid)
returns table(
  id uuid, description text, category text, value numeric, expense_date date,
  expense_kind text, responsible text, building_id uuid,
  is_holding_expense boolean, member_share numeric
)
language plpgsql security definer set search_path = public as $$
begin
  if target_member_user <> auth.uid() and not public.is_org_member(target_org, 'manager') then raise exception 'not_authorized'; end if;
  if not exists (select 1 from public.organization_members where organization_id = target_org and user_id = target_member_user) then raise exception 'member_not_found'; end if;
  perform set_config('request.jwt.claim.sub', target_member_user::text, true);
  return query select * from public.list_member_expenses(target_org);
end;
$$;
revoke all on function public.list_member_expenses(uuid, uuid) from public, anon;
grant execute on function public.list_member_expenses(uuid, uuid) to authenticated;
