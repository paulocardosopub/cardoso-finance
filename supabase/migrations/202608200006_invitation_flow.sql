create or replace function public.create_invitation(
  target_org uuid,
  target_email text,
  target_role public.member_role default 'viewer'
)
returns table(found boolean, invitation_id uuid, result_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(target_email));
  target_user uuid;
  existing_invitation uuid;
begin
  if not public.is_org_member(target_org, 'admin') then
    raise exception 'not_authorized';
  end if;
  if normalized_email = '' then
    return query select false, null::uuid, 'invalid_email';
    return;
  end if;

  select id into target_user from auth.users where lower(email) = normalized_email limit 1;
  if target_user is null then
    return query select false, null::uuid, 'user_not_found';
    return;
  end if;
  if exists (select 1 from public.organization_members where organization_id = target_org and user_id = target_user) then
    return query select true, null::uuid, 'already_member';
    return;
  end if;
  select id into existing_invitation
  from public.invitations
  where organization_id = target_org and lower(email) = normalized_email and status = 'pending' and expires_at > timezone('utc', now())
  order by created_at desc limit 1;
  if existing_invitation is not null then
    return query select true, existing_invitation, 'already_pending';
    return;
  end if;

  insert into public.invitations (organization_id, email, role, invited_by)
  values (target_org, normalized_email, target_role, auth.uid())
  returning id into existing_invitation;
  return query select true, existing_invitation, 'created';
end;
$$;

create or replace function public.list_my_invitations()
returns table(id uuid, organization_id uuid, organization_name text, role public.member_role, expires_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select i.id, i.organization_id, o.name, i.role, i.expires_at
  from public.invitations i
  join public.organizations o on o.id = i.organization_id
  where lower(i.email) = lower((select email from auth.users where id = auth.uid()))
    and i.status = 'pending'
    and i.expires_at > timezone('utc', now())
  order by i.created_at desc;
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
  values (invitation.organization_id, auth.uid(), invitation.role, invitation.ownership_percentage)
  on conflict (organization_id, user_id) do update set role = excluded.role;
  update public.invitations set status = 'accepted' where id = invitation.id;
  return invitation.organization_id;
end;
$$;

create or replace function public.decline_invitation(invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare current_email text;
begin
  current_email := lower((select email from auth.users where id = auth.uid()));
  update public.invitations set status = 'cancelled'
  where id = invitation_id and lower(email) = current_email and status = 'pending';
  if not found then raise exception 'invitation_not_found'; end if;
end;
$$;

grant execute on function public.create_invitation(uuid, text, public.member_role) to authenticated;
grant execute on function public.list_my_invitations() to authenticated;
grant execute on function public.accept_invitation(uuid) to authenticated;
grant execute on function public.decline_invitation(uuid) to authenticated;
