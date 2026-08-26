-- Permite que a funcionária consulte o status mensal necessário para operar os pagamentos.
drop policy if exists "lease payments employee read" on public.lease_payments;
create policy "lease payments employee read" on public.lease_payments
for select using (public.can_operate_properties(organization_id));

