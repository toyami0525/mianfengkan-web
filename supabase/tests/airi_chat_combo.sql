-- All fixture writes and local test settings are rolled back. Refuse to touch an active queue.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local plpgsql.check_asserts=on;
do $test$
declare
 a uuid; n text; prefix text:='airi-chat-qa-'||gen_random_uuid()::text;
 r jsonb; ids uuid[]:=array[]::uuid[]; code text; codes text[]:=array[]::text[];
 service text; v_price bigint; failed boolean; before_count integer; i integer:=0;
begin
 perform set_config('request.jwt.claims','{}',true);
 perform set_config('request.jwt.claim.sub','',true);
 select id,name into strict a,n from public.staff where slug='airi';
 perform pg_advisory_xact_lock(hashtextextended('mf-service:'||a::text,0));
 if exists(select 1 from public.reservations where staff_id=a and status in ('pending','acknowledged','confirmed','已確認')) then
  raise exception 'Refuse fixtures: queue is active';
 end if;
 assert not has_function_privilege('anon','public.enqueue_airi_service(uuid,text,text,text,text,text)','EXECUTE');
 assert not has_function_privilege('authenticated','public.enqueue_airi_service(uuid,text,text,text,text,text)','EXECUTE');
 assert has_function_privilege('service_role','public.enqueue_airi_service(uuid,text,text,text,text,text)','EXECUTE');
 update public.staff set accepting_reservations=true where id=a;
 insert into public.site_settings(key,value) values('booking_test_mode','{"enabled":true}'::jsonb)
  on conflict(key) do update set value=excluded.value;
 foreach service in array array['談天說地','簽繪拍立得','談天說地＋簽繪拍立得'] loop
  i:=i+1;
  loop
   code:='MF-'||translate(upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),'01','GH');
   exit when not exists(select 1 from public.polaroid_pickups where pickup_code=code);
  end loop;
  codes:=array_append(codes,code);
  if service='談天說地' then code:=null;v_price:=150000;
  elsif service='簽繪拍立得' then v_price:=300000;else v_price:=400000;end if;
  set local role service_role;
  r:=public.enqueue_airi_service(a,prefix||i,'測試伺服器',null,service,code);
  reset role;
  ids:=array_append(ids,(r->>'reservation_id')::uuid);
  assert (r->>'price')::bigint=v_price;
  assert (r->>'queue_count')::integer=i;
  assert (select price=v_price and service_name=service and booking_mode='queue' from public.reservations where id=ids[i]);
  assert (select count(*) from public.polaroid_pickups where reservation_id=ids[i])=case when i=1 then 0 else 1 end;
  if i=3 then assert (r->>'original_price')::bigint=450000;end if;
 end loop;
 -- Old client wrapper remains 300,000 and creates a single pickup.
 r:=public.enqueue_airi_reservation(a,prefix||'old','測試伺服器',null,codes[1]);
 ids:=array_append(ids,(r->>'reservation_id')::uuid);
 assert (r->>'price')::bigint=300000;
 assert (select count(*) from public.polaroid_pickups where reservation_id=ids[4])=1;
 -- Pickup failure must not leave a queue entry behind.
 failed:=false;
 begin
  perform public.enqueue_airi_service(a,prefix||'collision','測試伺服器',null,'談天說地＋簽繪拍立得',codes[3]);
 exception when unique_violation then failed:=true;end;
 assert failed;
 assert not exists(select 1 from public.reservations where guest_name=prefix||'collision');
 -- Each component and the full combo can independently pause the combo.
 foreach service in array array['談天說地','簽繪拍立得','談天說地＋簽繪拍立得'] loop
  insert into public.staff_service_availability(staff_id,service_name,enabled) values(a,service,false)
   on conflict(staff_id,service_name) do update set enabled=false;
  failed:=false;
  begin
   perform public.enqueue_airi_service(a,prefix||'paused','測試伺服器',null,'談天說地＋簽繪拍立得','MF-QQQQQQ');
  exception when sqlstate 'P0001' then failed:=position('暫停提供' in sqlerrm)>0;end;
  assert failed,'Paused component/combo must stop the bundle';
  update public.staff_service_availability set enabled=true where staff_id=a and service_name=service;
 end loop;
 r:=public.enqueue_airi_service(a,prefix||'fifth','測試伺服器',null,'談天說地',null);
 ids:=array_append(ids,(r->>'reservation_id')::uuid);
 assert (r->>'queue_count')::integer=5;
 failed:=false;
 begin perform public.enqueue_airi_service(a,prefix||'sixth','測試伺服器',null,'談天說地',null);
 exception when sqlstate 'P0001' then failed:=position('已滿 5 人' in sqlerrm)>0;end;
 assert failed,'All service types share a five-person queue';
 update public.reservations set status='acknowledged' where id=ids[3];
 failed:=false;
 begin update public.reservations set status='confirmed' where id=ids[3];
 exception when sqlstate 'P0001' then failed:=position('最前面' in sqlerrm)>0;end;
 assert failed,'Combo cannot skip chat ahead of it';
 update public.reservations set status='acknowledged' where id=ids[1];
 update public.reservations set status='confirmed' where id=ids[1];
 assert (select count(*) from public.reservations where staff_id=a and status in ('pending','acknowledged'))=4;
 update public.reservations set status='completed' where id=ids[1];
 perform public.cancel_queued_reservation(ids[3]);
 assert not exists(select 1 from public.polaroid_pickups where reservation_id=ids[3]);
 assert (select price from public.reservations where id=ids[3])=400000;
 -- No forged amount can create a discounted or legacy-priced new combo.
 failed:=false;
 begin
  insert into public.reservations(guest_name,guest_server,staff_id,staff_name,service_name,price,starts_at,ends_at,status,booking_mode)
   values(prefix||'forged','測試伺服器',a,n,'談天說地＋簽繪拍立得',1,now(),now()+interval '15 minutes','pending','queue');
 exception when sqlstate 'P0001' then failed:=position('金額不正確' in sqlerrm)>0;end;
 assert failed;
 assert not exists(select 1 from public.reservations where guest_name=prefix||'forged');
end;
$test$;
rollback;
select 'PASS: three prices, pickup 0/1/1, old wrapper, atomicity, switches, shared cap, FIFO, completion, cancellation, server-only RPC' as result;
