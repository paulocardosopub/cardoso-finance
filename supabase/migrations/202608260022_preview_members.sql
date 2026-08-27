-- Reliable member selector for management preview, including contacts without access.
create or replace function public.list_preview_members(target_org uuid)
returns table (
  member_id uuid,
  user_id uuid,
  contact_id uuid,
  full_name text,
  email text,
  role public.member_role,
  ownership_percentage numeric,
  joined_at timestamptz,
  is_placeholder boolean
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = auth.uid()
      and m.role in ('owner','admin','manager')
  ) then
    raise exception 'not_authorized';
  end if;

  return query
  select m.user_id, m.user_id, null::uuid,
    coalesce(nullif(p.full_name, ''), split_part(u.email, '@', 1), 'Usuário autenticado')::text,
    u.email::text, m.role, coalesce(m.ownership_percentage, 0), m.joined_at, false
  from public.organization_members m
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where m.organization_id = target_org
    and m.role <> 'employee'
  union all
  select c.id, null::uuid, c.id, c.full_name::text, c.email::text, c.role,
    coalesce(c.ownership_percentage, 0), c.created_at, true
  from public.organization_contacts c
  where c.organization_id = target_org
    and c.role <> 'employee'
  order by joined_at asc, full_name asc;
end;
$$;

revoke all on function public.list_preview_members(uuid) from public, anon;
grant execute on function public.list_preview_members(uuid) to authenticated;
