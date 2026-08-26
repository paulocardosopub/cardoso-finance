-- Guarda o endereço aproximado retornado pelo geocodificador reverso da visita.
alter table public.property_visits add column if not exists street text;
alter table public.property_visits add column if not exists neighborhood text;
alter table public.property_visits add column if not exists postal_code text;

drop function if exists public.record_property_visit(uuid, uuid, uuid, numeric, numeric, text);

create or replace function public.record_property_visit(
  target_org uuid,
  target_building uuid,
  target_unit uuid default null,
  visit_latitude numeric default null,
  visit_longitude numeric default null,
  visit_notes text default '',
  visit_street text default null,
  visit_neighborhood text default null,
  visit_postal_code text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare visit_id uuid;
begin
  if not public.can_operate_properties(target_org) then raise exception 'not_authorized'; end if;
  if not exists (select 1 from public.buildings where id=target_building and organization_id=target_org) then raise exception 'building_not_found'; end if;
  insert into public.property_visits(organization_id, building_id, unit_id, visited_by, latitude, longitude, street, neighborhood, postal_code, notes)
    values(target_org, target_building, target_unit, auth.uid(), visit_latitude, visit_longitude, left(nullif(trim(coalesce(visit_street, '')), ''), 200), left(nullif(trim(coalesce(visit_neighborhood, '')), ''), 160), left(nullif(trim(coalesce(visit_postal_code, '')), ''), 20), left(coalesce(visit_notes,''), 500))
    returning id into visit_id;
  return visit_id;
end;
$$;
revoke all on function public.record_property_visit(uuid, uuid, uuid, numeric, numeric, text, text, text, text) from public, anon;
grant execute on function public.record_property_visit(uuid, uuid, uuid, numeric, numeric, text, text, text, text) to authenticated;
