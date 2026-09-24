-- Every fixture is rolled back; never toggle a real staff member during QA.
begin;
set local lock_timeout='5s';
set local statement_timeout='20s';
do $test$
declare
  first_staff uuid; other_staff uuid; booking uuid; existing_booking uuid;
  owner_user uuid; staff_user uuid; rejected boolean; affected integer; service text;
begin
  insert into public.staff(name,slug,services,active,accepting_reservations)
  values ('__service_switch_test__','switch-test-'||gen_random_uuid(),array['泡湯搓澡','按摩','枕邊談心'],true,true)
  returning id into first_staff;
  insert into public.staff(name,slug,services,active,accepting_reservations)
  values ('__service_switch_other__','switch-test-'||gen_random_uuid(),array['泡湯搓澡','按摩','枕邊談心'],true,true)
  returning id into other_staff;
  existing_booking:=public.create_reservation('__test__',first_staff,'泡湯洗浴',150000::bigint,15,now()+interval '1 hour',null);
  select user_id into owner_user from public.staff_accounts where role='owner' and active limit 1;
  if owner_user is null then raise exception 'Owner account required to test RLS'; end if;
  perform set_config('request.jwt.claim.sub',owner_user::text,true);
  set local role authenticated;
  insert into public.staff_service_availability(staff_id,service_name,enabled)
    values(first_staff,'泡湯洗浴',false)
    on conflict(staff_id,service_name) do update set enabled=excluded.enabled;
  reset role;
  if not exists(select 1 from public.staff_service_availability where staff_id=first_staff and service_name='泡湯洗浴' and not enabled) then raise exception 'Owner pause was not saved'; end if;

  -- Current names, historical names, bundles and combinations all respect a pause.
  foreach service in array array['泡湯洗浴','泡湯搓澡','泡湯洗浴＋耳語陪伴','眠楓套席'] loop
    rejected:=false;
    set local role anon;
    begin
      perform public.create_reservation('__test__',first_staff,service,150000::bigint,15,now()+interval '2 hours',null);
    exception when sqlstate 'P0001' then
      if sqlerrm not like '%暫停提供%' then raise; end if;
      rejected:=true;
    end;
    reset role;
    if not rejected then raise exception 'Paused service accepted: %',service; end if;
  end loop;

  set local role anon;
  booking:=public.create_reservation('__test__',first_staff,'按摩服務',100000::bigint,15,now()+interval '2 hours',null);
  perform public.create_reservation('__test__',other_staff,'泡湯洗浴',150000::bigint,15,now()+interval '2 hours',null);
  rejected:=false;
  begin
    insert into public.staff_service_availability(staff_id,service_name,enabled) values(other_staff,'按摩服務',false);
  exception when insufficient_privilege then rejected:=true;
  end;
  reset role;
  if not rejected then raise exception 'Guest changed a service switch'; end if;

  -- A signed-in non-owner cannot edit this table either.
  select user_id into staff_user from public.staff_accounts where role='staff' and active limit 1;
  perform set_config('request.jwt.claim.sub',coalesce(staff_user,gen_random_uuid())::text,true);
  set local role authenticated;
  update public.staff_service_availability set enabled=true where staff_id=first_staff;
  get diagnostics affected=row_count;
  reset role;
  if affected<>0 then raise exception 'Non-owner changed a service switch'; end if;

  -- Existing bookings remain intact, can finish, and new bookings resume on reopen.
  update public.reservations set status='completed' where id=existing_booking;
  if not exists(select 1 from public.reservations where id=existing_booking and status='completed' and service_name='泡湯洗浴') then raise exception 'Existing booking changed'; end if;
  perform set_config('request.jwt.claim.sub',owner_user::text,true);
  set local role authenticated;
  insert into public.staff_service_availability(staff_id,service_name,enabled)
    values(first_staff,'泡湯洗浴',true)
    on conflict(staff_id,service_name) do update set enabled=excluded.enabled;
  reset role;
  set local role anon;
  perform public.create_reservation('__test__',first_staff,'泡湯洗浴',150000::bigint,15,now()+interval '3 hours',null);
  reset role;

  insert into public.staff_service_availability(staff_id,service_name,enabled) values(first_staff,'紀念拍立得',false);
  set local role anon;
  rejected:=false;
  begin
    perform public.create_reservation('__test__',first_staff,'耳語陪伴',100000::bigint,15,now()+interval '4 hours','包含：慕斯菲露紀念拍立得');
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%暫停提供%' then raise; end if;
    rejected:=true;
  end;
  reset role;
  if not rejected then raise exception 'Paused photo add-on accepted'; end if;
end;
$test$;
rollback;
select 'PASS: owner save/reopen, guest and staff restrictions, independent services/staff, legacy and bundle requests, photo add-ons, existing bookings' as result;
