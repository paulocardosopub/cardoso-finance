create or replace function public._rebalance_organization_ownership(target_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with ranked as (
    select organization_id, user_id,
      row_number() over (order by joined_at, user_id) as position,
      count(*) over () as total
    from public.organization_members
    where organization_id = target_org
  )
  update public.organization_members m
  set ownership_percentage = case
    when ranked.position = ranked.total then round(100 - (ranked.total - 1) * round(100 / ranked.total, 4), 4)
    else round(100 / ranked.total, 4)
  end
  from ranked
  where m.organization_id = ranked.organization_id and m.user_id = ranked.user_id;
end;
$$;

create or replace function public.rebalance_organization_ownership(target_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_org_member(target_org, 'admin') then raise exception 'not_authorized'; end if;
  perform public._rebalance_organization_ownership(target_org);
end;
$$;

create or replace function public.update_member_ownership(
  target_org uuid,
  target_user uuid,
  new_percentage numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_org_member(target_org, 'admin') then raise exception 'not_authorized'; end if;
  if new_percentage < 0 or new_percentage > 100 then raise exception 'invalid_percentage'; end if;
  if not exists (select 1 from public.organization_members where organization_id = target_org and user_id = target_user) then raise exception 'member_not_found'; end if;

  update public.organization_members
  set ownership_percentage = round(new_percentage, 4)
  where organization_id = target_org and user_id = target_user;

  with ranked as (
    select organization_id, user_id,
      row_number() over (order by joined_at, user_id) as position,
      count(*) over () as total
    from public.organization_members
    where organization_id = target_org and user_id <> target_user
  )
  update public.organization_members m
  set ownership_percentage = case
    when ranked.position = ranked.total then round(100 - new_percentage - (ranked.total - 1) * round((100 - new_percentage) / ranked.total, 4), 4)
    else round((100 - new_percentage) / ranked.total, 4)
  end
  from ranked
  where m.organization_id = ranked.organization_id and m.user_id = ranked.user_id;
end;
$$;

create or replace function public.accept_invitation(invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.invitations%rowtype;
  current_email text;
begin
  current_email := lower((select email from auth.users where id = auth.uid()));
  select * into invitation from public.invitations
  where id = invitation_id and lower(email) = current_email and status = 'pending' and expires_at > timezone('utc', now())
  for update;
  if invitation.id is null then raise exception 'invitation_not_found'; end if;

  insert into public.organization_members (organization_id, user_id, role, ownership_percentage)
  values (invitation.organization_id, auth.uid(), invitation.role, 0)
  on conflict (organization_id, user_id) do update set role = excluded.role;
  update public.invitations set status = 'accepted' where id = invitation.id;
  perform public._rebalance_organization_ownership(invitation.organization_id);
  return invitation.organization_id;
end;
$$;

grant execute on function public.rebalance_organization_ownership(uuid) to authenticated;
grant execute on function public.update_member_ownership(uuid, uuid, numeric) to authenticated;

do $$
declare target_org uuid;
begin
  for target_org in select id from public.organizations loop
    perform public._rebalance_organization_ownership(target_org);
  end loop;
end;
$$;
