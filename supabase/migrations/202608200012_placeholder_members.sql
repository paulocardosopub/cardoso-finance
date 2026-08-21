create table if not exists public.organization_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  email text not null default '',
  role public.member_role not null default 'viewer',
  ownership_percentage numeric(7,4) not null default 0 check (ownership_percentage >= 0 and ownership_percentage <= 100),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.organization_contacts enable row level security;
drop policy if exists "organization contacts member read" on public.organization_contacts;
drop policy if exists "organization contacts admin manage" on public.organization_contacts;
create policy "organization contacts member read" on public.organization_contacts for select using (public.is_org_member(organization_id));
create policy "organization contacts admin manage" on public.organization_contacts for all using (public.is_org_member(organization_id, 'admin')) with check (public.is_org_member(organization_id, 'admin'));
create index if not exists organization_contacts_org_idx on public.organization_contacts(organization_id, created_at);
create trigger organization_contacts_updated_at before update on public.organization_contacts for each row execute procedure public.set_updated_at();

alter table public.expenses add column if not exists responsible_contact_id uuid references public.organization_contacts(id) on delete set null;
create index if not exists expenses_contact_responsible_idx on public.expenses(organization_id, responsible_contact_id);

create or replace function public._rebalance_organization_ownership(target_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  with ranked as (
    select member_id, member_type, row_number() over (order by joined_at, member_id) as position, count(*) over () as total
    from (
      select user_id as member_id, 'user'::text as member_type, joined_at from public.organization_members where organization_id = target_org
      union all
      select id as member_id, 'contact'::text as member_type, created_at as joined_at from public.organization_contacts where organization_id = target_org
    ) members
  ), assigned as (
    select *, case when position = total then round(100 - (total - 1) * round(100 / total, 4), 4) else round(100 / total, 4) end as percentage from ranked
  )
  update public.organization_members m set ownership_percentage = assigned.percentage from assigned where assigned.member_type = 'user' and m.organization_id = target_org and m.user_id = assigned.member_id;

  with ranked as (
    select member_id, member_type, row_number() over (order by joined_at, member_id) as position, count(*) over () as total
    from (
      select user_id as member_id, 'user'::text as member_type, joined_at from public.organization_members where organization_id = target_org
      union all
      select id as member_id, 'contact'::text as member_type, created_at as joined_at from public.organization_contacts where organization_id = target_org
    ) members
  ), assigned as (
    select *, case when position = total then round(100 - (total - 1) * round(100 / total, 4), 4) else round(100 / total, 4) end as percentage from ranked
  )
  update public.organization_contacts c set ownership_percentage = assigned.percentage from assigned where assigned.member_type = 'contact' and c.organization_id = target_org and c.id = assigned.member_id;
end;
$$;

create or replace function public.update_member_ownership(target_org uuid, target_user uuid, new_percentage numeric)
returns void language plpgsql security definer set search_path = public as $$
declare target_kind text; other_count integer;
begin
  if not public.is_org_member(target_org, 'admin') then raise exception 'not_authorized'; end if;
  if new_percentage < 0 or new_percentage > 100 then raise exception 'invalid_percentage'; end if;
  if exists (select 1 from public.organization_members where organization_id = target_org and user_id = target_user) then target_kind := 'user';
  elsif exists (select 1 from public.organization_contacts where organization_id = target_org and id = target_user) then target_kind := 'contact';
  else raise exception 'member_not_found'; end if;

  if target_kind = 'user' then update public.organization_members set ownership_percentage = round(new_percentage, 4) where organization_id = target_org and user_id = target_user;
  else update public.organization_contacts set ownership_percentage = round(new_percentage, 4) where organization_id = target_org and id = target_user;
  end if;

  select count(*) into other_count from (
    select user_id as member_id from public.organization_members where organization_id = target_org and user_id <> target_user
    union all select id as member_id from public.organization_contacts where organization_id = target_org and id <> target_user
  ) others;
  if other_count > 0 then
    with ranked as (
      select member_id, member_kind, row_number() over (order by joined_at, member_id) as position from (
        select user_id as member_id, 'user'::text as member_kind, joined_at from public.organization_members where organization_id = target_org and user_id <> target_user
        union all select id as member_id, 'contact'::text as member_kind, created_at as joined_at from public.organization_contacts where organization_id = target_org and id <> target_user
      ) others
    ), assigned as (
      select *, case when position = other_count then round(100 - new_percentage - (other_count - 1) * round((100 - new_percentage) / other_count, 4), 4) else round((100 - new_percentage) / other_count, 4) end as percentage from ranked
    )
    update public.organization_members m set ownership_percentage = assigned.percentage from assigned where assigned.member_kind = 'user' and m.organization_id = target_org and m.user_id = assigned.member_id;

    with ranked as (
      select member_id, member_kind, row_number() over (order by joined_at, member_id) as position from (
        select user_id as member_id, 'user'::text as member_kind, joined_at from public.organization_members where organization_id = target_org and user_id <> target_user
        union all select id as member_id, 'contact'::text as member_kind, created_at as joined_at from public.organization_contacts where organization_id = target_org and id <> target_user
      ) others
    ), assigned as (
      select *, case when position = other_count then round(100 - new_percentage - (other_count - 1) * round((100 - new_percentage) / other_count, 4), 4) else round((100 - new_percentage) / other_count, 4) end as percentage from ranked
    )
    update public.organization_contacts c set ownership_percentage = assigned.percentage from assigned where assigned.member_kind = 'contact' and c.organization_id = target_org and c.id = assigned.member_id;
  end if;
end;
$$;

create or replace function public.update_member_role(target_org uuid, target_user uuid, new_role public.member_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_org_member(target_org, 'admin') then raise exception 'not_authorized'; end if;
  if new_role = 'owner' then raise exception 'owner_role_locked'; end if;
  if target_user = auth.uid() then raise exception 'cannot_change_own_role'; end if;
  if exists (select 1 from public.organization_members where organization_id = target_org and user_id = target_user) then update public.organization_members set role = new_role where organization_id = target_org and user_id = target_user;
  elsif exists (select 1 from public.organization_contacts where organization_id = target_org and id = target_user) then update public.organization_contacts set role = new_role where organization_id = target_org and id = target_user;
  else raise exception 'member_not_found'; end if;
end;
$$;

create or replace function public.create_organization_contact(target_org uuid, target_name text, target_email text default '', target_role public.member_role default 'viewer')
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not public.is_org_member(target_org, 'admin') then raise exception 'not_authorized'; end if;
  if nullif(trim(target_name), '') is null then raise exception 'name_required'; end if;
  if target_role = 'owner' then raise exception 'owner_role_locked'; end if;
  insert into public.organization_contacts(organization_id, full_name, email, role, created_by) values(target_org, trim(target_name), lower(trim(coalesce(target_email, ''))), target_role, auth.uid()) returning id into new_id;
  perform public._rebalance_organization_ownership(target_org);
  return new_id;
end;
$$;

create or replace function public.delete_organization_contact(target_org uuid, target_contact uuid, reassign_to uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare target_name text; replacement_name text; replacement_user uuid; replacement_contact uuid;
begin
  if not public.is_org_member(target_org, 'admin') then raise exception 'not_authorized'; end if;
  select full_name into target_name from public.organization_contacts where id = target_contact and organization_id = target_org;
  if target_name is null then raise exception 'member_not_found'; end if;
  if reassign_to is not null then
    select coalesce(nullif(p.full_name, ''), split_part(u.email, '@', 1), 'Usuário autenticado'), user_id, null::uuid into replacement_name, replacement_user, replacement_contact from public.organization_members m join auth.users u on u.id = m.user_id left join public.profiles p on p.id = m.user_id where m.organization_id = target_org and m.user_id = reassign_to;
    if replacement_name is null then select full_name, null::uuid, id into replacement_name, replacement_user, replacement_contact from public.organization_contacts where organization_id = target_org and id = reassign_to; end if;
    if replacement_name is null then raise exception 'replacement_not_found'; end if;
  end if;
  update public.expenses set responsible = coalesce(replacement_name, 'Holding'), responsible_user_id = replacement_user, responsible_contact_id = replacement_contact where organization_id = target_org and responsible_contact_id = target_contact;
  delete from public.organization_contacts where id = target_contact and organization_id = target_org;
  perform public._rebalance_organization_ownership(target_org);
end;
$$;

drop function if exists public.list_organization_members(uuid);
create function public.list_organization_members(target_org uuid)
returns table (member_id uuid, user_id uuid, contact_id uuid, full_name text, email text, role public.member_role, ownership_percentage numeric, joined_at timestamptz, is_placeholder boolean)
language sql security definer set search_path = public as $$
  select m.user_id, m.user_id, null::uuid, coalesce(nullif(p.full_name, ''), split_part(u.email, '@', 1), 'Usuário autenticado'), u.email, m.role, m.ownership_percentage, m.joined_at, false
  from public.organization_members m join auth.users u on u.id = m.user_id left join public.profiles p on p.id = m.user_id
  where m.organization_id = target_org and public.is_org_member(target_org)
  union all
  select c.id, null::uuid, c.id, c.full_name, c.email, c.role, c.ownership_percentage, c.created_at, true
  from public.organization_contacts c where c.organization_id = target_org and public.is_org_member(target_org)
  order by joined_at asc;
$$;

grant execute on function public.create_organization_contact(uuid, text, text, public.member_role) to authenticated;
grant execute on function public.delete_organization_contact(uuid, uuid, uuid) to authenticated;
grant execute on function public.list_organization_members(uuid) to authenticated;
grant execute on function public.update_member_ownership(uuid, uuid, numeric) to authenticated;
grant execute on function public.update_member_role(uuid, uuid, public.member_role) to authenticated;

do $$ declare target_org uuid; begin for target_org in select id from public.organizations loop perform public._rebalance_organization_ownership(target_org); end loop; end $$;
