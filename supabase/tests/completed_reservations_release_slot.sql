-- Uses the guest role and rolls back every fixture; safe to run without leaving test bookings.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
DO $regression$
DECLARE
  staff_id uuid;
  original_id uuid;
  new_id uuid;
  state text;
  blocked boolean;
  public_data jsonb;
  original_end timestamptz := now() + interval '10 minutes';
  next_start timestamptz := now() + interval '1 second';
BEGIN
  INSERT INTO public.staff(name, slug, active, accepting_reservations)
  VALUES ('__reservation_release_regression__', 'regression-' || gen_random_uuid()::text, true, true)
  RETURNING id INTO staff_id;
  INSERT INTO public.reservations(guest_name, staff_id, staff_name, service_name, starts_at, ends_at, status)
  VALUES ('__reservation_release_regression__', staff_id, '__reservation_release_regression__', '耳語陪伴',
          now() - interval '5 minutes', original_end, 'confirmed')
  RETURNING id INTO original_id;

  -- Terminal bookings release the slot even ten minutes before the scheduled end.
  FOREACH state IN ARRAY ARRAY['completed','已完成','cancelled','rejected','已取消','已拒絕']
  LOOP
    UPDATE public.reservations SET status = state WHERE id = original_id;
    SET LOCAL ROLE anon;
    public_data := public.get_public_booking_data();
    new_id := public.create_reservation(
      '__reservation_release_regression__', staff_id, '耳語陪伴',
      100000::bigint, 15, next_start, NULL
    );
    RESET ROLE;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(public_data->'blocks') block
      WHERE block->>'staff_id' = staff_id::text AND block->>'block_type' = 'reservation'
    ) THEN
      RAISE EXCEPTION 'Terminal status % still appears occupied', state;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.reservations
      WHERE id = new_id AND status = 'pending' AND starts_at = next_start
    ) THEN
      RAISE EXCEPTION 'New booking was not created for terminal status %', state;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.reservations
      WHERE id = original_id AND ends_at = original_end AND status = state
    ) THEN
      RAISE EXCEPTION 'Historical booking changed unexpectedly';
    END IF;
    DELETE FROM public.reservations WHERE id = new_id;
  END LOOP;

  -- An unfinished booking must still reject an overlapping booking.
  FOREACH state IN ARRAY ARRAY['pending','acknowledged','confirmed','已確認']
  LOOP
    UPDATE public.reservations SET status = state WHERE id = original_id;
    blocked := false;
    BEGIN
      SET LOCAL ROLE anon;
      public_data := public.get_public_booking_data();
      PERFORM public.create_reservation(
        '__reservation_release_regression__', staff_id, '耳語陪伴',
        100000::bigint, 15, next_start, NULL
      );
      RESET ROLE;
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      RESET ROLE;
      IF SQLERRM <> '此時段已有其他預約' THEN RAISE; END IF;
      blocked := true;
    END;
    IF NOT blocked THEN RAISE EXCEPTION 'Active status % accepted an overlapping booking', state; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(public_data->'blocks') block
      WHERE block->>'staff_id' = staff_id::text AND block->>'block_type' = 'reservation'
    ) THEN RAISE EXCEPTION 'Active status % was missing from public availability', state; END IF;
  END LOOP;

  -- Finishing an order does not override a staff member's pause switch.
  UPDATE public.reservations SET status = 'completed' WHERE id = original_id;
  UPDATE public.staff SET accepting_reservations = false WHERE id = staff_id;
  blocked := false;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.create_reservation(
      '__reservation_release_regression__', staff_id, '耳語陪伴',
      100000::bigint, 15, next_start, NULL
    );
    RESET ROLE;
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    RESET ROLE;
    IF SQLERRM <> '此館員目前不接受預約' THEN RAISE; END IF;
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Staff pause was ignored'; END IF;
END;
$regression$;
ROLLBACK;
SELECT 'PASS: completed orders release immediately; six terminal statuses, four active statuses and paused staff verified; fixtures rolled back' AS regression_result;

