-- Sinalizadores de acompanhamento comercial e de atenção operacional.
alter table public.buildings
  add column if not exists sale_proximity boolean not null default false,
  add column if not exists attention boolean not null default false,
  add column if not exists attention_note text not null default '';

create index if not exists buildings_org_flags_idx
  on public.buildings(organization_id, sale_proximity, attention);
