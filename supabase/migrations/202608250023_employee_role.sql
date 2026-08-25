-- Add the operational employee role before functions reference it.
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='member_role' AND e.enumlabel='employee') THEN ALTER TYPE public.member_role ADD VALUE 'employee'; END IF; END $$;
