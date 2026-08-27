-- Habilita eventos em tempo real para que todas as telas operacionais
-- recebam a confirmação/desfazimento de pagamentos sem depender apenas do polling.
do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'lease_payments'
  ) then
    execute 'alter publication supabase_realtime add table public.lease_payments';
  end if;
end
$$;
