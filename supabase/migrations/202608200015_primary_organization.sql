alter table public.organization_members add column if not exists is_primary boolean not null default false;
create index if not exists organization_members_primary_idx on public.organization_members(user_id, is_primary);

do $$ declare person uuid; first_org uuid; begin
  for person in select distinct user_id from public.organization_members loop
    select organization_id into first_org from public.organization_members where user_id = person order by joined_at asc limit 1;
    if first_org is not null and not exists (select 1 from public.organization_members where user_id = person and is_primary) then update public.organization_members set is_primary = true where user_id = person and organization_id = first_org; end if;
  end loop;
end $$;

create or replace function public.set_primary_organization(target_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.organization_members where organization_id = target_org and user_id = auth.uid()) then raise exception 'not_a_member'; end if;
  update public.organization_members set is_primary = false where user_id = auth.uid();
  update public.organization_members set is_primary = true where organization_id = target_org and user_id = auth.uid();
end;
$$;
grant execute on function public.set_primary_organization(uuid) to authenticated;

create or replace function public.create_organization(org_name text, org_type public.organization_type, org_description text default '', org_currency char(3) default 'BRL')
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  insert into public.organizations(name,type,description,currency,owner_id) values(org_name,org_type,org_description,org_currency,auth.uid()) returning id into new_id;
  insert into public.organization_members(organization_id,user_id,role,ownership_percentage,is_primary) values(new_id,auth.uid(),'owner',100,true);
  return new_id;
end;
$$;
grant execute on function public.create_organization(text, public.organization_type, text, char) to authenticated;

create or replace function public.accept_invitation(invitation_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare invitation public.invitations%rowtype; current_email text; make_primary boolean;
begin
  current_email := lower((select email from auth.users where id = auth.uid()));
  select * into invitation from public.invitations where id = invitation_id and lower(email) = current_email and status = 'pending' and expires_at > timezone('utc', now()) for update;
  if invitation.id is null then raise exception 'invitation_not_found'; end if;
  select not exists (select 1 from public.organization_members where user_id = auth.uid() and is_primary) into make_primary;
  insert into public.organization_members (organization_id, user_id, role, ownership_percentage, is_primary) values (invitation.organization_id, auth.uid(), invitation.role, 0, make_primary) on conflict (organization_id, user_id) do update set role = excluded.role;
  update public.invitations set status = 'accepted' where id = invitation.id;
  perform public._rebalance_organization_ownership(invitation.organization_id);
  return invitation.organization_id;
end;
$$;
grant execute on function public.accept_invitation(uuid) to authenticated;

create or replace function public.leave_organization(target_org uuid)
returns void language plpgsql security definer set search_path = public as $$
declare current_role public.member_role; was_primary boolean; next_org uuid;
begin
  select role, is_primary into current_role, was_primary from public.organization_members where organization_id = target_org and user_id = auth.uid();
  if current_role is null then raise exception 'not_a_member'; end if;
  if current_role = 'owner' then raise exception 'owner_cannot_leave'; end if;
  delete from public.organization_members where organization_id = target_org and user_id = auth.uid();
  if was_primary then select organization_id into next_org from public.organization_members where user_id = auth.uid() order by joined_at asc limit 1; if next_org is not null then update public.organization_members set is_primary = true where organization_id = next_org and user_id = auth.uid(); end if; end if;
end;
$$;
grant execute on function public.leave_organization(uuid) to authenticated;
