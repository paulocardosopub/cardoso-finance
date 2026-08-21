create or replace function public.list_organization_members(target_org uuid)
returns table (
  user_id uuid,
  full_name text,
  email text,
  role public.member_role,
  ownership_percentage numeric,
  joined_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    m.user_id,
    coalesce(nullif(p.full_name, ''), split_part(u.email, '@', 1), 'Usuário autenticado') as full_name,
    u.email,
    m.role,
    m.ownership_percentage,
    m.joined_at
  from public.organization_members m
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where m.organization_id = target_org
    and public.is_org_member(target_org)
  order by m.joined_at asc;
$$;

create or replace function public.update_member_role(
  target_org uuid,
  target_user uuid,
  new_role public.member_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_org_member(target_org, 'admin') then
    raise exception 'not_authorized';
  end if;

  if new_role = 'owner' then
    raise exception 'owner_role_locked';
  end if;

  if target_user = auth.uid() then
    raise exception 'cannot_change_own_role';
  end if;

  if not exists (
    select 1
    from public.organization_members
    where organization_id = target_org and user_id = target_user
  ) then
    raise exception 'member_not_found';
  end if;

  update public.organization_members
  set role = new_role
  where organization_id = target_org and user_id = target_user;
end;
$$;

grant execute on function public.list_organization_members(uuid) to authenticated;
grant execute on function public.update_member_role(uuid, uuid, public.member_role) to authenticated;
