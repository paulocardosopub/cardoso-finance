alter table public.expenses
  add column if not exists expense_kind text not null default 'recurring';

alter table public.expenses
  add column if not exists responsible_user_id uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'expenses_expense_kind_check'
      and conrelid = 'public.expenses'::regclass
  ) then
    alter table public.expenses
      add constraint expenses_expense_kind_check check (expense_kind in ('fixed', 'recurring', 'one_time'));
  end if;
end $$;

create index if not exists expenses_org_kind_idx on public.expenses(organization_id, expense_kind, expense_date desc);
create index if not exists expenses_responsible_idx on public.expenses(organization_id, responsible_user_id);
