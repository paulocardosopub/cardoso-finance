-- Permite várias fotos por unidade, com no máximo uma marcada como principal.
alter table public.documents
  add column if not exists is_primary boolean not null default false;

create unique index if not exists documents_one_primary_photo_per_unit_idx
  on public.documents (organization_id, unit_id)
  where category = 'photo' and is_primary = true and unit_id is not null;

create index if not exists documents_unit_photo_idx
  on public.documents (organization_id, unit_id, category, created_at desc);
