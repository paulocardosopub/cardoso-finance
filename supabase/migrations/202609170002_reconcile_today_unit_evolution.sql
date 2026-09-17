-- Reconcilia a transição comprovada de 17/09/2026 sem inventar outros eventos.
-- A unidade foi criada com status alugado, mas o contrato foi criado/atualizado
-- em 17/09/2026; o relato operacional confirma que a transição ocorreu nessa data.
create temporary table if not exists _today_units_evolution on commit drop as
  select distinct u.id, u.organization_id, u.building_id, l.id as lease_id, l.current_rent, l.tenant_id, u.code, u.quantity
  from public.property_units u
  join public.leases l on l.unit_id=u.id and l.organization_id=u.organization_id
  where u.status::text='rented'
    and u.updated_at::date=date '2026-09-17'
    and (l.created_at::date=date '2026-09-17' or l.updated_at::date=date '2026-09-17');

update public.unit_evolution_history h
set new_status='vacant', new_rent=0, monthly_impact=0,
    metadata=h.metadata || jsonb_build_object('reconciled','pre-2026-09-17 state inferred from confirmed transition')
where h.event_type='unit_snapshot'
  and h.occurred_at < timestamptz '2026-09-17 00:00:00+00'
  and h.unit_id in (select id from _today_units_evolution);

insert into public.unit_evolution_history (organization_id, building_id, unit_id, lease_id, event_type, occurred_at, old_status, new_status, old_rent, new_rent, new_tenant_id, monthly_impact, metadata)
select tu.organization_id, tu.building_id, tu.id, tu.lease_id, 'status_changed',
       coalesce((select l.updated_at from public.leases l where l.id=tu.lease_id), timestamptz '2026-09-17 12:00:00+00'),
       'vacant', 'rented', 0, tu.current_rent, tu.tenant_id,
       coalesce(tu.current_rent,0)*greatest(coalesce(tu.quantity,1),1),
       jsonb_build_object('source','user_reported_change','evidence','unit and lease updated on 2026-09-17','code',tu.code,'quantity',tu.quantity)
from _today_units_evolution tu
where not exists (
  select 1 from public.unit_evolution_history h
  where h.unit_id=tu.id and h.event_type='status_changed' and h.occurred_at::date=date '2026-09-17' and h.old_status='vacant' and h.new_status='rented'
);

drop table if exists _today_units_evolution;
