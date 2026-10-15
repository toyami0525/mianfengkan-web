-- Additive service update. Existing reservations, prices, staff availability and payroll are preserved.
set local lock_timeout='5s';
set local statement_timeout='30s';
alter table public.staff_service_availability drop constraint staff_service_availability_service_name_check;
alter table public.staff_service_availability add constraint staff_service_availability_service_name_check check (
 service_name in ('泡湯洗浴','按摩服務','耳語陪伴','Q版繪圖(公版)','簽繪拍立得','拍立得(無簽繪)','紀念拍立得','談天說地','談天說地＋簽繪拍立得')
);

-- Retain the original FIFO/capacity/permissions trigger and change only the new-entry product guard.
do $migration$
declare definition text; old_guard text; new_guard text; marker text;
begin
 old_guard:=$old$if new.service_name is distinct from '簽繪拍立得' or new.price is distinct from 300000::bigint then
      raise exception '愛梨目前僅提供簽繪拍立得排隊' using errcode='P0001';
    end if;$old$;
 new_guard:=$new$if not coalesce((new.service_name='簽繪拍立得' and new.price=300000)
      or (new.service_name='談天說地' and new.price=150000)
      or (new.service_name='談天說地＋簽繪拍立得' and new.price=400000),false) then
      raise exception '愛梨的服務項目或金額不正確，請重新選擇服務' using errcode='P0001';
    end if;$new$;
 definition:=pg_get_functiondef('private.guard_airi_reservation_queue()'::regprocedure);
 if strpos(definition,old_guard)=0 then raise exception 'Queue guard has changed; review before migration'; end if;
 execute replace(definition,old_guard,new_guard);

 -- Check the whole bundle switch as well as each component switch.
 definition:=pg_get_functiondef('public.guard_paused_reservation_services()'::regprocedure);
 marker:=$marker$if '眠楓套席'=any(requested) then$marker$;
 if strpos(definition,marker)=0 then raise exception 'Service switch guard has changed; review before migration'; end if;
 execute replace(definition,marker,'requested:=array_append(requested,coalesce(new.service_name,''''));'||chr(10)||'  '||marker);
end;
$migration$;

create function public.enqueue_airi_service(
 p_staff_id uuid,p_guest_name text,p_guest_server text,p_note text,p_service_name text,p_pickup_code text
) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
 v_staff public.staff%rowtype; v_id uuid; v_count integer; v_local timestamp; v_test boolean;
 v_price bigint; v_original bigint; v_photo boolean;
begin
 if length(btrim(coalesce(p_guest_name,''))) not between 1 and 100
  or length(btrim(coalesce(p_guest_server,''))) not between 1 and 60
  or length(coalesce(p_note,''))>2000 then
  raise exception '請確認客人名稱、伺服器與備註內容' using errcode='P0001';
 end if;
 case p_service_name
  when '談天說地' then v_price:=150000;v_original:=150000;v_photo:=false;
  when '簽繪拍立得' then v_price:=300000;v_original:=300000;v_photo:=true;
  when '談天說地＋簽繪拍立得' then v_price:=400000;v_original:=450000;v_photo:=true;
  else raise exception '請選擇愛梨的談天說地、簽繪拍立得或優惠組合' using errcode='P0001';
 end case;
 if v_photo and (p_pickup_code is null or p_pickup_code!~'^MF-[A-HJ-NP-Z2-9]{6}$') then
  raise exception '取件碼格式不正確' using errcode='P0001';
 end if;
 if not v_photo and p_pickup_code is not null then
  raise exception '談天說地不需要成品取件碼' using errcode='P0001';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mf-service:'||p_staff_id::text,0));
 select * into v_staff from public.staff where id=p_staff_id and slug='airi';
 if not found or v_staff.active is distinct from true or v_staff.accepting_reservations is distinct from true then
  raise exception '愛梨目前未開放排隊，請稍後再查看' using errcode='P0001';
 end if;
 v_local:=clock_timestamp() at time zone 'Asia/Taipei';
 if extract(isodow from v_local)=1 or exists(select 1 from public.venue_closures where work_date=v_local::date) then
  raise exception '今日休館，暫停接受排隊' using errcode='P0001';
 end if;
 select coalesce(value='true'::jsonb or value->'enabled'='true'::jsonb,false) into v_test
  from public.site_settings where key='booking_test_mode';
 if not coalesce(v_test,false) and v_local::time<time '21:00' then
  raise exception '目前非指名時間，每日 21:00 起開放排隊' using errcode='P0001';
 end if;
 if exists(select 1 from public.staff_work_calendar where staff_id=p_staff_id and work_date=v_local::date and status='off') then
  raise exception '愛梨今日休假，暫停接受排隊' using errcode='P0001';
 end if;
 insert into public.reservations(guest_name,guest_server,staff_id,staff_name,service_name,price,starts_at,ends_at,note,status,booking_mode)
 values(btrim(p_guest_name),btrim(p_guest_server),v_staff.id,v_staff.name,p_service_name,v_price,
  clock_timestamp(),clock_timestamp()+interval '15 minutes',nullif(btrim(coalesce(p_note,'')),''),'pending','queue') returning id into v_id;
 if v_photo then
  insert into public.polaroid_pickups(reservation_id,staff_id,staff_name,guest_name,guest_server,pickup_code,status,item_type)
  values(v_id,v_staff.id,v_staff.name,btrim(p_guest_name),btrim(p_guest_server),p_pickup_code,'processing','airi_signed_polaroid');
 end if;
 select count(*) into v_count from public.reservations where staff_id=p_staff_id and status in ('pending','acknowledged');
 return jsonb_build_object('reservation_id',v_id,'pickup_code',p_pickup_code,'service_name',p_service_name,'price',v_price,'original_price',v_original,
  'booking_mode','queue','queue_count',v_count,'queue_position',v_count,'queue_limit',5);
end;
$$;
revoke all on function public.enqueue_airi_service(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.enqueue_airi_service(uuid,text,text,text,text,text) to service_role;

-- Old deployed clients/RPC callers still get the original signed product at 300,000 Gil.
create or replace function public.enqueue_airi_reservation(p_staff_id uuid,p_guest_name text,p_guest_server text,p_note text,p_pickup_code text)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
begin
 return public.enqueue_airi_service(p_staff_id,p_guest_name,p_guest_server,p_note,'簽繪拍立得',p_pickup_code);
end;
$$;
revoke all on function public.enqueue_airi_reservation(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.enqueue_airi_reservation(uuid,text,text,text,text) to service_role;

update public.staff set services=array['談天說地','簽繪拍立得','談天說地＋簽繪拍立得'],updated_at=now() where slug='airi';
notify pgrst,'reload schema';
