-- Allow a profile to be created when an older account does not have the
-- trigger-created row. The application still restricts the row to its owner.
drop policy if exists "profiles self insert" on public.profiles;
create policy "profiles self insert" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());
