-- Store the configurable member slots with each saved property division.
alter table public.division_simulations
  add column if not exists member_config jsonb not null default '[{"id":"member-1","name":"Membro 1","color":"#80e2b0"},{"id":"member-2","name":"Membro 2","color":"#62b6ff"},{"id":"member-3","name":"Membro 3","color":"#c59cff"},{"id":"member-4","name":"Membro 4","color":"#f0be4a"}]'::jsonb;

-- Member identifiers are scenario data, not a fixed list of real people.
alter table public.division_simulation_items
  drop constraint if exists division_simulation_items_assignment_check;

alter table public.division_simulation_items
  add constraint division_simulation_items_assignment_check
  check (length(trim(assignment)) > 0);
