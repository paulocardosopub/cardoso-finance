create or replace function public.leave_organization(target_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare current_role public.member_role;
begin
  select role into current_role
  from public.organization_members
  where organization_id = target_org and user_id = auth.uid();

  if current_role is null then
    raise exception 'not_a_member';
  end if;
  if current_role = 'owner' then
    raise exception 'owner_cannot_leave';
  end if;

  delete from public.organization_members
  where organization_id = target_org and user_id = auth.uid();
end;
$$;

grant execute on function public.leave_organization(uuid) to authenticated;
