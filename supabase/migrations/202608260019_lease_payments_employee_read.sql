-- A funcionária precisa consultar os pagamentos da holding para que o status
-- confirmado por outro usuário seja refletido na mesma lista operacional.
drop policy if exists "lease payments employee read" on public.lease_payments;
create policy "lease payments employee read" on public.lease_payments
for select
using (public.can_operate_properties(organization_id));
