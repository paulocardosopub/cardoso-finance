-- Cobranças precisam de uma data de atualização para sincronizar alterações
-- de aluguel e pagamentos. A coluna não existia no esquema inicial.
alter table public.lease_payments
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

update public.lease_payments
   set updated_at = coalesce(updated_at, created_at, timezone('utc', now()))
 where updated_at is null;
