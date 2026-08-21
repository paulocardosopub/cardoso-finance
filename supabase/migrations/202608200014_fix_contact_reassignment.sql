create or replace function public.delete_organization_contact(target_org uuid, target_contact uuid, reassign_to uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare target_name text; replacement_name text; replacement_user uuid; replacement_contact uuid;
begin
  if not public.is_org_member(target_org, 'admin') then raise exception 'not_authorized'; end if;
  select full_name into target_name from public.organization_contacts where id = target_contact and organization_id = target_org;
  if target_name is null then raise exception 'member_not_found'; end if;
  if reassign_to is not null then
    select coalesce(nullif(p.full_name, ''), split_part(u.email, '@', 1), 'Usuário autenticado'), m.user_id, null::uuid into replacement_name, replacement_user, replacement_contact from public.organization_members m join auth.users u on u.id = m.user_id left join public.profiles p on p.id = m.user_id where m.organization_id = target_org and m.user_id = reassign_to;
    if replacement_name is null then select full_name, null::uuid, id into replacement_name, replacement_user, replacement_contact from public.organization_contacts where organization_id = target_org and id = reassign_to; end if;
    if replacement_name is null then raise exception 'replacement_not_found'; end if;
  end if;
  update public.expenses set responsible = coalesce(replacement_name, 'Holding'), responsible_user_id = replacement_user, responsible_contact_id = replacement_contact where organization_id = target_org and responsible_contact_id = target_contact;
  delete from public.organization_contacts where id = target_contact and organization_id = target_org;
  perform public._rebalance_organization_ownership(target_org);
end;
$$;
grant execute on function public.delete_organization_contact(uuid, uuid, uuid) to authenticated;
