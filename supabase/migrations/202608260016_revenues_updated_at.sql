-- Créditos editáveis também precisam registrar a última alteração.
alter table public.revenues
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

update public.revenues
   set updated_at = coalesce(updated_at, created_at, timezone('utc', now()))
 where updated_at is null;
