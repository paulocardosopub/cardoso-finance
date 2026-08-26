-- Quando o aluguel vigente muda, atualiza as cobranças pendentes da mesma unidade.
create or replace function public.sync_pending_payment_rent()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.current_rent is distinct from old.current_rent then
    update public.lease_payments
       set expected_amount = greatest(0, new.current_rent),
           updated_at = timezone('utc', now())
     where lease_id = new.id
       and organization_id = new.organization_id
       and status = 'pending';
  end if;
  return new;
end;
$$;
drop trigger if exists leases_sync_pending_payment_rent on public.leases;
create trigger leases_sync_pending_payment_rent
after update of current_rent on public.leases
for each row execute function public.sync_pending_payment_rent();
