-- Release a finished service immediately without changing its recorded times.
-- Preserve existing function bodies, security settings and EXECUTE grants.
DO $migration$
DECLARE
  signature text;
  definition text;
  old_filter constant text := 'r.status not in (''cancelled'', ''rejected'', ''已取消'', ''已拒絕'')';
  new_filter constant text := 'r.status not in (''completed'', ''cancelled'', ''rejected'', ''已完成'', ''已取消'', ''已拒絕'')';
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.create_reservation(text,uuid,text,bigint,integer,timestamp with time zone,text)',
    'public.get_public_booking_data()'
  ]
  LOOP
    definition := pg_get_functiondef(signature::regprocedure);
    IF strpos(definition, old_filter) > 0 THEN
      EXECUTE replace(definition, old_filter, new_filter);
    ELSIF strpos(definition, new_filter) = 0 THEN
      RAISE EXCEPTION 'Unexpected reservation filter in %; review before applying', signature;
    END IF;
  END LOOP;
END;
$migration$;
