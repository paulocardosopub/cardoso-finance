-- Keep the allocation mode with each saved scenario so a building-level plan
-- is restored with the same valuation rules used when it was created.
alter table public.division_simulations
  add column if not exists allocation_mode text not null default 'unit';

alter table public.division_simulations
  drop constraint if exists division_simulations_allocation_mode_check;

alter table public.division_simulations
  add constraint division_simulations_allocation_mode_check
  check (allocation_mode in ('unit', 'building'));

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'assets') then
    alter publication supabase_realtime add table public.assets;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'buildings') then
    alter publication supabase_realtime add table public.buildings;
  end if;
end $$;
