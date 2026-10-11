-- Airi queue regression: synthetic records only; every change is rolled back.
-- Run after 20261011170217_airi_reservation_queue.sql as a database administrator.
-- The first guard refuses to run if Airi has any live unfinished reservation.
-- No storage objects or orders are touched. Opening/availability changes are local
-- to this transaction. Business-day gates are never disabled for this test.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '45s';
set local plpgsql.check_asserts = on;

do $test$
declare
  v_airi uuid;
  v_airi_name text;
  v_other uuid;
  v_id uuid;
  v_ids uuid[] := array[]::uuid[];
  v_prefix text := 'airi-queue-test-'||replace(gen_random_uuid()::text,'-','');
  v_server text := 'test-'||replace(gen_random_uuid()::text,'-','');
  v_started timestamptz := clock_timestamp();
  v_count integer;
  v_waiting integer;
  v_serving integer;
  v_before integer;
  v_failed boolean;
  v_message text;
  v_exists boolean;
  v_result jsonb;
  v_public jsonb;
  v_public_staff jsonb;
  v_mode text;
  v_test_role text;
  v_image text;
  v_code text;
  v_rpc_id uuid;
  v_local timestamp;
  v_test_mode boolean;
  v_can_enqueue boolean;
  v_saved_claims text := current_setting('request.jwt.claims',true);
  v_saved_sub text := current_setting('request.jwt.claim.sub',true);
begin
  -- All actor-free writes below model trusted service-side SQL, not a guest JWT.
  perform set_config('request.jwt.claims','{}',true);
  perform set_config('request.jwt.claim.sub','',true);

  select id,name into strict v_airi,v_airi_name from public.staff where slug='airi';
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mf-service:'||v_airi::text,0)
  );
  if exists(
    select 1 from public.reservations
    where staff_id=v_airi
      and coalesce(status,'pending') not in
        ('completed','cancelled','rejected','已完成','已取消','已拒絕')
  ) then
    raise exception 'Regression refused: Airi has live unfinished reservations; no fixture DML was performed.';
  end if;

  -- These changes remain invisible to other transactions and are rolled back.
  update public.staff set active=true,accepting_reservations=true where id=v_airi;
  insert into public.staff_service_availability(staff_id,service_name,enabled)
    values(v_airi,'簽繪拍立得',true)
    on conflict(staff_id,service_name) do update set enabled=true;

  assert not has_function_privilege('anon',
    'public.enqueue_airi_reservation(uuid,text,text,text,text)','EXECUTE'),
    'anon must not execute enqueue RPC';
  assert not has_function_privilege('authenticated',
    'public.enqueue_airi_reservation(uuid,text,text,text,text)','EXECUTE'),
    'authenticated must not execute enqueue RPC';
  assert has_function_privilege('service_role',
    'public.enqueue_airi_reservation(uuid,text,text,text,text)','EXECUTE'),
    'service_role must execute enqueue RPC';
  assert not has_function_privilege('anon',
    'public.cancel_queued_reservation(uuid)','EXECUTE'),
    'anon must not execute cancel RPC';
  assert not has_function_privilege('authenticated',
    'public.cancel_queued_reservation(uuid)','EXECUTE'),
    'authenticated must not execute cancel RPC';
  assert has_function_privilege('service_role',
    'public.cancel_queued_reservation(uuid)','EXECUTE'),
    'service_role must execute cancel RPC';
  assert not has_function_privilege('anon',
    'private.guard_airi_reservation_queue()','EXECUTE'),
    'queue trigger must not be directly executable by anon';
  assert not has_function_privilege('authenticated',
    'private.guard_airi_reservation_queue()','EXECUTE'),
    'queue trigger must not be directly executable by authenticated';

  -- Even an INSERT claiming "timed" must become a queue record for Airi.
  for i in 1..5 loop
    insert into public.reservations(
      guest_name,guest_server,staff_id,staff_name,service_name,price,
      starts_at,ends_at,note,status,booking_mode,created_at
    ) values(
      v_prefix||'-guest-'||i,v_server,v_airi,v_airi_name,'簽繪拍立得',300000,
      clock_timestamp(),clock_timestamp()+interval '15 minutes',
      v_prefix,'pending','timed',timestamptz '2000-01-01 00:00:00+00'
    ) returning id into v_id;
    v_ids:=array_append(v_ids,v_id);
  end loop;

  select count(*),count(distinct queue_slot) into v_count,v_waiting
    from public.reservations where id=any(v_ids) and booking_mode='queue'
      and status='pending' and queue_slot between 1 and 5 and created_at>=v_started;
  assert v_count=5 and v_waiting=5,
    'five waiting rows must occupy five distinct slots with DB-assigned arrival time';

  v_failed:=false;
  begin
    insert into public.reservations(
      guest_name,guest_server,staff_id,staff_name,service_name,price,
      starts_at,ends_at,status,booking_mode
    ) values(v_prefix||'-guest-6',v_server,v_airi,v_airi_name,'簽繪拍立得',300000,
      clock_timestamp(),clock_timestamp()+interval '15 minutes','pending','queue');
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message=message_text;
    v_failed:=position('已滿 5 人' in v_message)>0;
  end;
  assert v_failed,'sixth waiting guest must be rejected by capacity guard';

  -- Acknowledging a guest does not release their place.
  update public.reservations set status='acknowledged' where id=v_ids[5];
  select count(*) into v_count from public.reservations where staff_id=v_airi
    and status in ('pending','acknowledged');
  assert v_count=5,'acknowledgement must keep all five waiting places occupied';

  v_failed:=false;
  begin
    update public.reservations set status='confirmed' where id=v_ids[5];
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message=message_text;
    v_failed:=position('最前面' in v_message)>0;
  end;
  assert v_failed,'starting the tail before the head must fail FIFO';

  update public.reservations set status='acknowledged' where id=v_ids[1];
  update public.reservations set status='confirmed' where id=v_ids[1];
  select count(*) filter(where status in ('pending','acknowledged')),
    count(*) filter(where status='confirmed') into v_waiting,v_serving
    from public.reservations where staff_id=v_airi;
  assert v_waiting=4 and v_serving=1,
    'starting the head must produce four waiting plus one serving';
  select queue_slot is null into v_exists from public.reservations where id=v_ids[1];
  assert v_exists,'serving guest must release the internal waiting slot';

  insert into public.reservations(
    guest_name,guest_server,staff_id,staff_name,service_name,price,
    starts_at,ends_at,status,booking_mode
  ) values(v_prefix||'-guest-6',v_server,v_airi,v_airi_name,'簽繪拍立得',300000,
    clock_timestamp(),clock_timestamp()+interval '15 minutes','pending','queue')
    returning id into v_id;
  v_ids:=array_append(v_ids,v_id);
  select count(*) filter(where status in ('pending','acknowledged')),
    count(*) filter(where status='confirmed') into v_waiting,v_serving
    from public.reservations where staff_id=v_airi;
  assert v_waiting=5 and v_serving=1,
    'a new fifth waiting guest must be admitted while one guest is serving';

  update public.reservations set status='acknowledged' where id=v_ids[2];
  v_failed:=false;
  begin
    update public.reservations set status='confirmed' where id=v_ids[2];
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message=message_text;
    v_failed:=position('正在服務中' in v_message)>0;
  end;
  assert v_failed,'a second serving guest must be rejected even when first in line';

  v_failed:=false;
  begin
    insert into public.reservations(
      guest_name,guest_server,staff_id,staff_name,service_name,price,
      starts_at,ends_at,status,booking_mode
    ) values('  '||v_prefix||'-guest-2  ','  '||v_server||'  ',v_airi,v_airi_name,
      '簽繪拍立得',300000,clock_timestamp(),clock_timestamp()+interval '15 minutes',
      'pending','queue');
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message=message_text;
    v_failed:=position('重複加入' in v_message)>0;
  end;
  assert v_failed,'same guest/server with extra surrounding spaces must not queue twice';

  v_failed:=false;
  begin
    update public.reservations set booking_mode='timed' where id=v_ids[2];
  exception when sqlstate 'P0001' then v_failed:=true;
  end;
  assert v_failed,'queue mode must be immutable';

  v_failed:=false;
  begin
    update public.reservations set created_at=created_at-interval '1 day' where id=v_ids[2];
  exception when sqlstate 'P0001' then v_failed:=true;
  end;
  assert v_failed,'FIFO arrival time must be immutable';

  v_failed:=false;
  begin
    update public.reservations set staff_id=null where id=v_ids[2];
  exception when sqlstate 'P0001' then v_failed:=true;
  end;
  assert v_failed,'clearing staff_id must not evade queue indexes';

  -- Completion frees the serving position; it does not erase paid history.
  update public.reservations set status='completed' where id=v_ids[1];
  select count(*) into v_count from public.reservations where staff_id=v_airi and status='confirmed';
  assert v_count=0,'completion must release the serving position';
  select status='completed' and price=300000 and queue_slot is null and ends_at>starts_at
    into v_exists from public.reservations where id=v_ids[1];
  assert v_exists,'completed reservation and its financial history must remain';
  update public.reservations set status='confirmed' where id=v_ids[2];

  -- Waiting cancellation must keep reservation history but remove its pickup atomically.
  v_image:='regression-not-uploaded/'||v_prefix||'-cancel.png';
  insert into public.polaroid_pickups(
    reservation_id,staff_id,staff_name,guest_name,guest_server,pickup_code,status,item_type,image_path
  ) values(v_ids[3],v_airi,v_airi_name,v_prefix||'-guest-3',v_server,
    'TEST-'||replace(gen_random_uuid()::text,'-',''),'processing','airi_signed_polaroid',v_image);

  begin
    execute 'set local role service_role';
    v_result:=public.cancel_queued_reservation(v_ids[3]);
    execute 'reset role';
  exception when others then
    execute 'reset role';
    raise;
  end;
  select status='cancelled' and price=300000 and queue_slot is null
    into v_exists from public.reservations where id=v_ids[3];
  assert v_exists,'cancel RPC must retain the cancelled reservation';
  select exists(select 1 from public.polaroid_pickups where reservation_id=v_ids[3]) into v_exists;
  assert not v_exists,'cancel RPC must delete the linked synthetic pickup';
  assert (v_result->>'removed_pickups')::integer=1,'cancel RPC must report removed pickup count';
  assert (v_result->'image_paths') @> to_jsonb(array[v_image]),
    'cancel RPC must return the removed image path for later storage cleanup';
  select count(*) into v_count from public.reservations where staff_id=v_airi
    and status in ('pending','acknowledged');
  assert v_count=3,'waiting cancellation must release exactly one place';

  -- Cancelling the current service frees that position as well.
  begin
    execute 'set local role service_role';
    v_result:=public.cancel_queued_reservation(v_ids[2]);
    execute 'reset role';
  exception when others then
    execute 'reset role';
    raise;
  end;
  select count(*) into v_count from public.reservations where staff_id=v_airi and status='confirmed';
  assert v_count=0,'serving cancellation must release the serving position';
  select status='cancelled' and queue_slot is null into v_exists
    from public.reservations where id=v_ids[2];
  assert v_exists,'serving cancellation must preserve reservation history';

  -- A terminal cancellation rejection must not erase an already completed pickup.
  insert into public.polaroid_pickups(
    reservation_id,staff_id,staff_name,guest_name,guest_server,pickup_code,status,item_type,image_path,completed_at
  ) values(v_ids[1],v_airi,v_airi_name,v_prefix||'-guest-1',v_server,
    'TEST-'||replace(gen_random_uuid()::text,'-',''),'ready','airi_signed_polaroid',
    'regression-not-uploaded/'||v_prefix||'-completed.png',clock_timestamp());
  v_failed:=false;
  begin
    execute 'set local role service_role';
    perform public.cancel_queued_reservation(v_ids[1]);
    execute 'reset role';
  exception when sqlstate 'P0001' then
    execute 'reset role';
    v_failed:=true;
  end;
  assert v_failed,'cancel RPC must refuse a completed reservation';
  select exists(select 1 from public.polaroid_pickups where reservation_id=v_ids[1] and status='ready')
    into v_exists;
  assert v_exists,'failed terminal cancellation must leave the completed pickup intact';

  -- There are spare places here: RLS must be the reason these requests fail.
  foreach v_test_role in array array['anon','authenticated'] loop
    foreach v_mode in array array['timed','queue'] loop
      v_failed:=false;
      begin
        perform set_config('request.jwt.claims',
          jsonb_build_object('role',v_test_role,'sub',gen_random_uuid()::text)::text,true);
        execute format('set local role %I',v_test_role);
        insert into public.reservations(
          guest_name,guest_server,staff_id,staff_name,service_name,price,
          starts_at,ends_at,status,booking_mode
        ) values(v_prefix||'-'||v_test_role||'-'||v_mode,v_server,v_airi,v_airi_name,
          '簽繪拍立得',300000,clock_timestamp(),clock_timestamp()+interval '15 minutes',
          'pending',v_mode);
        execute 'reset role';
      exception when insufficient_privilege then
        get stacked diagnostics v_message=message_text;
        execute 'reset role';
        v_failed:=position('row-level security policy' in v_message)>0;
      end;
      perform set_config('request.jwt.claims','{}',true);
      assert v_failed,format('%s direct INSERT with %s flag must fail queue RLS',v_test_role,v_mode);
    end loop;
  end loop;
  select count(*) into v_count from public.reservations where staff_id=v_airi
    and status in ('pending','acknowledged');
  assert v_count=3,'rejected RLS inserts must leave no reservations or occupied slots';

  -- The legacy RPC must remain usable for a synthetic ordinary staff member.
  insert into public.staff(name,slug,active,accepting_reservations,services)
    values(v_prefix||'-staff',v_prefix||'-staff',true,true,array['按摩服務'])
    returning id into v_other;
  v_id:=public.create_reservation(v_prefix||'-timed-guest',v_other,'按摩服務',10000,30,
    clock_timestamp()+interval '1 hour',v_prefix);
  select booking_mode='timed' and queue_slot is null and status='pending'
    into v_exists from public.reservations where id=v_id;
  assert v_exists,'ordinary staff must still create timed reservations through the legacy RPC';

  v_failed:=false;
  begin
    perform public.create_reservation(v_prefix||'-old-rpc',v_airi,'簽繪拍立得',300000,15,
      clock_timestamp()+interval '1 hour',v_prefix);
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message=message_text;
    v_failed:=position('採排隊制' in v_message)>0;
  end;
  assert v_failed,'legacy RPC must not create new timed Airi reservations';

  v_public:=public.get_public_booking_data();
  select item into v_public_staff from jsonb_array_elements(v_public->'staff') item
    where item->>'id'=v_airi::text;
  assert v_public_staff is not null,'public booking data must include accepting Airi';
  assert v_public_staff->>'booking_mode'='queue' and (v_public_staff->>'queue_limit')::integer=5
    and (v_public_staff->>'queue_count')::integer=3,
    'public booking data must expose the current waiting count and limit';
  select exists(select 1 from jsonb_array_elements(v_public->'blocks') item
    where item->>'staff_id'=v_airi::text) into v_exists;
  assert not v_exists,'public booking RPC must not expose Airi time blocks';
  select exists(select 1 from jsonb_array_elements(v_public->'blocks') item
    where item->>'staff_id'=v_other::text) into v_exists;
  assert v_exists,'ordinary staff time blocks must remain public';

  -- Exercise RPC atomicity only when the real venue/day/hour gates permit it.
  -- Today being Monday is an expected rejection, not a reason to change settings.
  v_local:=clock_timestamp() at time zone 'Asia/Taipei';
  select coalesce(value='true'::jsonb or value->'enabled'='true'::jsonb,false)
    into v_test_mode from public.site_settings where key='booking_test_mode';
  v_can_enqueue:=extract(isodow from v_local)<>1
    and (coalesce(v_test_mode,false) or v_local::time>=time '21:00')
    and not exists(select 1 from public.venue_closures where work_date=v_local::date)
    and not exists(select 1 from public.staff_work_calendar
      where staff_id=v_airi and work_date=v_local::date and status='off');
  loop
    v_code:='MF-'||translate(upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),'01','GH');
    exit when not exists(select 1 from public.polaroid_pickups where pickup_code=v_code);
  end loop;

  if v_can_enqueue then
    begin
      execute 'set local role service_role';
      v_result:=public.enqueue_airi_reservation(v_airi,v_prefix||'-rpc',v_server,v_prefix,v_code);
      execute 'reset role';
    exception when others then
      execute 'reset role';
      raise;
    end;
    v_rpc_id:=(v_result->>'reservation_id')::uuid;
    select exists(select 1 from public.reservations where id=v_rpc_id and booking_mode='queue'
      and status='pending' and guest_name=v_prefix||'-rpc') into v_exists;
    assert v_exists,'successful enqueue RPC must persist its queue reservation';
    select exists(select 1 from public.polaroid_pickups where reservation_id=v_rpc_id
      and pickup_code=v_code and item_type='airi_signed_polaroid') into v_exists;
    assert v_exists,'successful enqueue RPC must create the matching pickup';
    select count(*) into v_before from public.reservations where staff_id=v_airi
      and status in ('pending','acknowledged');

    -- Reuse that pickup code: pickup failure must roll back the just-created reservation.
    v_failed:=false;
    begin
      execute 'set local role service_role';
      perform public.enqueue_airi_reservation(v_airi,v_prefix||'-rpc-code-conflict',v_server,v_prefix,v_code);
      execute 'reset role';
    exception when unique_violation then
      execute 'reset role';
      v_failed:=true;
    end;
    assert v_failed,'duplicate pickup code must fail atomically';
    select exists(select 1 from public.reservations
      where staff_id=v_airi and guest_name=v_prefix||'-rpc-code-conflict') into v_exists;
    assert not v_exists,'pickup failure must not leave an orphan reservation';
    select count(*) into v_count from public.reservations where staff_id=v_airi
      and status in ('pending','acknowledged');
    assert v_count=v_before,'pickup failure must not consume a waiting place';
  else
    v_failed:=false;
    begin
      execute 'set local role service_role';
      perform public.enqueue_airi_reservation(v_airi,v_prefix||'-closed-rpc',v_server,v_prefix,v_code);
      execute 'reset role';
    exception when sqlstate 'P0001' then
      get stacked diagnostics v_message=message_text;
      execute 'reset role';
      v_failed:=position('今日休館' in v_message)>0
        or position('目前非指名時間' in v_message)>0
        or position('今日休假' in v_message)>0;
    end;
    assert v_failed,'enqueue RPC must obey the actual closure/hour/work-calendar gate';
    select exists(select 1 from public.reservations
      where staff_id=v_airi and guest_name=v_prefix||'-closed-rpc') into v_exists;
    assert not v_exists,'closed-hours rejection must not create a reservation';
    select exists(select 1 from public.polaroid_pickups where pickup_code=v_code) into v_exists;
    assert not v_exists,'closed-hours rejection must not create a pickup';
  end if;

  perform set_config('request.jwt.claims',coalesce(v_saved_claims,''),true);
  perform set_config('request.jwt.claim.sub',coalesce(v_saved_sub,''),true);
end;
$test$;

rollback;
select 'tests OK'::text as result;

