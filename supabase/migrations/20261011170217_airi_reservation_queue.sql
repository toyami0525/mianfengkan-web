-- 愛梨：最多五位等候、一位服務中。沿用指名與取件紀錄，歷史資料不變。
alter table public.reservations
  add column booking_mode text not null default 'timed',
  add column queue_slot smallint,
  add constraint reservations_booking_mode_check check (booking_mode in ('timed','queue')),
  add constraint reservations_queue_state_check check (
    (booking_mode='timed' and queue_slot is null)
    or (booking_mode='queue'
      and staff_id is not null and created_at is not null
      and guest_server is not null and btrim(guest_server)<>''
      and status is not null
      and status in ('pending','acknowledged','confirmed','completed','cancelled','rejected')
      and ((status in ('pending','acknowledged') and queue_slot is not null and queue_slot between 1 and 5)
        or (status in ('confirmed','completed','cancelled','rejected') and queue_slot is null)))
  );

create unique index reservations_queue_waiting_slot_key
  on public.reservations(staff_id,queue_slot)
  where booking_mode='queue' and status in ('pending','acknowledged');
create unique index reservations_queue_one_serving_key
  on public.reservations(staff_id)
  where booking_mode='queue' and status='confirmed';
create unique index reservations_queue_guest_key
  on public.reservations(staff_id,lower(btrim(guest_name)),lower(btrim(guest_server)))
  where booking_mode='queue' and status in ('pending','acknowledged','confirmed');
create index reservations_queue_fifo_idx
  on public.reservations(staff_id,created_at,id)
  where booking_mode='queue' and status in ('pending','acknowledged');

create schema if not exists private;
revoke all on schema private from public;

-- 必須跨 RLS 計數，故使用不可直接呼叫的 private trigger。
-- VOLATILE 的各次查詢在取得鎖之後讀取最新已提交資料；unique index 再兜住硬上限。
create function private.guard_airi_reservation_queue()
returns trigger language plpgsql volatile security definer set search_path='' as $$
declare
  v_slug text;
  v_waiting integer;
  v_slot smallint;
  v_first uuid;
  v_actor uuid;
  v_role text;
  v_actor_staff uuid;
begin
  if tg_op='DELETE' then
    if old.booking_mode='queue' then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mf-service:'||old.staff_id::text,0));
    end if;
    return old;
  end if;

  select slug into v_slug from public.staff where id=new.staff_id;
  if tg_op='UPDATE' and old.booking_mode='queue' then
    if new.id is distinct from old.id or new.staff_id is distinct from old.staff_id
      or new.booking_mode is distinct from old.booking_mode or new.created_at is distinct from old.created_at
      or new.guest_name is distinct from old.guest_name or new.guest_server is distinct from old.guest_server
      or new.service_name is distinct from old.service_name or new.price is distinct from old.price then
      raise exception '不可變更排隊單的館員、客人、服務或排隊順序' using errcode='P0001';
    end if;
  elsif tg_op='UPDATE' and v_slug='airi' then
    -- 不把過往一般指名轉為隊列，也不允許以改館員繞過加入排隊流程。
    if new.staff_id is distinct from old.staff_id or new.booking_mode<>'timed' or new.queue_slot is not null then
      raise exception '請使用愛梨的加入排隊功能建立新的排隊單' using errcode='P0001';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mf-service:'||new.staff_id::text,0));
    if new.status is distinct from old.status and (new.status is null or new.status not in ('completed','cancelled','rejected','已完成','已取消','已拒絕')) then
      raise exception '舊指名不能重新加入排隊，請建立新的排隊單' using errcode='P0001';
    end if;
    return new;
  end if;

  if v_slug is distinct from 'airi' then
    if new.booking_mode<>'timed' or new.queue_slot is not null then
      raise exception '此館員未啟用排隊制' using errcode='P0001';
    end if;
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mf-service:'||new.staff_id::text,0));
  if tg_op='INSERT' then
    new.booking_mode:='queue';
    if new.status is distinct from 'pending' then
      raise exception '新排隊必須先等待確認' using errcode='P0001';
    end if;
    if new.service_name is distinct from '簽繪拍立得' or new.price is distinct from 300000::bigint then
      raise exception '愛梨目前僅提供簽繪拍立得排隊' using errcode='P0001';
    end if;
    new.guest_name:=btrim(new.guest_name);
    new.guest_server:=btrim(new.guest_server);
    if coalesce(new.guest_name,'')='' or coalesce(new.guest_server,'')='' then
      raise exception '請填寫客人名稱與伺服器' using errcode='P0001';
    end if;
    if exists(select 1 from public.reservations r where r.staff_id=new.staff_id
      and r.status in ('pending','acknowledged','confirmed','已確認')
      and lower(btrim(r.guest_name))=lower(new.guest_name)
      and lower(btrim(r.guest_server))=lower(new.guest_server)) then
      raise exception '這位客人已在愛梨的排隊或服務名單中，請勿重複加入' using errcode='P0001';
    end if;
    new.created_at:=clock_timestamp();
    -- 舊會計欄位要求起訖非空；這些相容值不是 ETA，也不控制隊列過期。
    new.starts_at:=new.created_at;
    new.ends_at:=new.starts_at+interval '15 minutes';
  else
    v_actor:=auth.uid();
    if v_actor is not null then
      select role,staff_id into v_role,v_actor_staff from public.staff_accounts where user_id=v_actor and active=true;
      if v_role is null or (v_role='staff' and v_actor_staff is distinct from new.staff_id)
        or v_role not in ('owner','staff','frontdesk') then
        raise exception '沒有處理這筆排隊的權限' using errcode='42501';
      end if;
      if v_role='frontdesk' and new.status is distinct from old.status and new.status not in ('cancelled','rejected') then
        raise exception '櫃台帳號只能取消排隊，服務請由愛梨或館主處理' using errcode='42501';
      end if;
    end if;
    if new.status is null
      or (old.status='pending' and new.status not in ('pending','acknowledged','cancelled','rejected'))
      or (old.status='acknowledged' and new.status not in ('acknowledged','confirmed','cancelled','rejected'))
      or (old.status='confirmed' and new.status not in ('confirmed','completed','cancelled','rejected'))
      or (old.status in ('completed','cancelled','rejected') and new.status is distinct from old.status) then
      raise exception '排隊狀態已變更，請重新整理後依序確認、開始或完成' using errcode='P0001';
    end if;
    new.starts_at:=old.starts_at;
    new.ends_at:=old.ends_at;
    if new.status='confirmed' and old.status='acknowledged' then
      if exists(select 1 from public.reservations r where r.staff_id=new.staff_id and r.id<>new.id
        and r.status in ('confirmed','已確認')) then
        raise exception '愛梨已有一位客人正在服務中，請完成後再開始下一位' using errcode='P0001';
      end if;
      select id into v_first from public.reservations where staff_id=new.staff_id
        and status in ('pending','acknowledged') order by created_at nulls last,id limit 1;
      if v_first is distinct from new.id then
        raise exception '請先處理排在最前面的客人' using errcode='P0001';
      end if;
      new.starts_at:=clock_timestamp();
      new.ends_at:=new.starts_at+interval '15 minutes';
    elsif new.status='completed' and old.status='confirmed' then
      new.ends_at:=greatest(clock_timestamp(),new.starts_at+interval '1 microsecond');
    end if;
  end if;

  if new.status in ('pending','acknowledged') then
    select count(*) into v_waiting from public.reservations
      where staff_id=new.staff_id and id<>new.id and status in ('pending','acknowledged');
    if v_waiting>=5 then
      raise exception '愛梨目前排隊已滿 5 人，請稍後再試' using errcode='P0001';
    end if;
    if tg_op='UPDATE' and old.status in ('pending','acknowledged') then
      new.queue_slot:=old.queue_slot;
    else
      select slot::smallint into v_slot from generate_series(1,5) slot
        where not exists(select 1 from public.reservations r where r.staff_id=new.staff_id
          and r.booking_mode='queue' and r.status in ('pending','acknowledged') and r.queue_slot=slot)
        order by slot limit 1;
      if v_slot is null then raise exception '愛梨目前排隊已滿 5 人，請稍後再試' using errcode='P0001'; end if;
      new.queue_slot:=v_slot;
    end if;
  else
    new.queue_slot:=null;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_airi_reservation_queue() from public,anon,authenticated,service_role;
create trigger guard_airi_reservation_queue before insert or update or delete on public.reservations
  for each row execute function private.guard_airi_reservation_queue();

-- 原有 public INSERT policy 保留供一般館員使用；隊列只能透過服務端 RPC 建立。
create policy "queue inserts require server" on public.reservations as restrictive
  for insert to anon,authenticated with check (booking_mode<>'queue');

create function public.enqueue_airi_reservation(
  p_staff_id uuid,p_guest_name text,p_guest_server text,p_note text,p_pickup_code text
) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
  v_staff public.staff%rowtype;
  v_id uuid;
  v_count integer;
  v_local timestamp;
  v_test boolean;
begin
  if length(btrim(coalesce(p_guest_name,''))) not between 1 and 100
    or length(btrim(coalesce(p_guest_server,''))) not between 1 and 60
    or length(coalesce(p_note,''))>2000 then
    raise exception '請確認客人名稱、伺服器與備註內容' using errcode='P0001';
  end if;
  if p_pickup_code is null or p_pickup_code!~'^MF-[A-HJ-NP-Z2-9]{6}$' then
    raise exception '取件碼格式不正確' using errcode='P0001';
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
  values(btrim(p_guest_name),btrim(p_guest_server),v_staff.id,v_staff.name,'簽繪拍立得',300000,
    clock_timestamp(),clock_timestamp()+interval '15 minutes',
    nullif(btrim(coalesce(p_note,'')),''),'pending','queue') returning id into v_id;
  insert into public.polaroid_pickups(reservation_id,staff_id,staff_name,guest_name,guest_server,pickup_code,status,item_type)
  values(v_id,v_staff.id,v_staff.name,btrim(p_guest_name),btrim(p_guest_server),p_pickup_code,'processing','airi_signed_polaroid');
  select count(*) into v_count from public.reservations where staff_id=p_staff_id and status in ('pending','acknowledged');
  return jsonb_build_object('reservation_id',v_id,'pickup_code',p_pickup_code,
    'booking_mode','queue','queue_count',v_count,'queue_position',v_count,'queue_limit',5);
end;
$$;
revoke all on function public.enqueue_airi_reservation(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.enqueue_airi_reservation(uuid,text,text,text,text) to service_role;

-- 先成功取消狀態，再在同一交易清除取件紀錄；避免與「完成」競爭時誤刪成品。
create function public.cancel_queued_reservation(p_reservation_id uuid)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
  v_reservation public.reservations%rowtype;
  v_image_paths text[];
  v_removed integer;
begin
  update public.reservations set status='cancelled'
    where id=p_reservation_id and booking_mode='queue' and status in ('pending','acknowledged','confirmed')
    returning * into v_reservation;
  if not found then raise exception '這筆排隊已完成或取消，請重新整理後查看' using errcode='P0001'; end if;
  with removed as (
    delete from public.polaroid_pickups where reservation_id=p_reservation_id returning image_path
  )
  select coalesce(array_agg(image_path) filter(where nullif(btrim(image_path),'') is not null),array[]::text[]),count(*)::integer
    into v_image_paths,v_removed from removed;
  return jsonb_build_object('reservation',to_jsonb(v_reservation),'image_paths',v_image_paths,'removed_pickups',v_removed);
end;
$$;
revoke all on function public.cancel_queued_reservation(uuid) from public,anon,authenticated;
grant execute on function public.cancel_queued_reservation(uuid) to service_role;

comment on column public.reservations.booking_mode is 'timed uses service times; queue uses explicit status and FIFO, with no public end estimate.';
comment on column public.reservations.queue_slot is 'Internal capacity slot 1-5, not the FIFO position. Assigned and released by trigger.';

-- 舊客戶端不可建立愛梨的時間制指名。
CREATE OR REPLACE FUNCTION public.create_reservation(p_guest_name text, p_staff_id uuid, p_service_name text, p_price bigint, p_duration_minutes integer, p_start_at timestamp with time zone, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_end_at timestamptz;
  v_staff_name text;
begin
  if exists(select 1 from public.staff where id=p_staff_id and slug='airi') then
    raise exception '愛梨採排隊制，請重新整理指名頁面後加入排隊' using errcode='P0001';
  end if;
  if trim(coalesce(p_guest_name, '')) = '' then
    raise exception '請填寫客人名稱';
  end if;
  if p_start_at <= now() then
    raise exception '不可預約過去的時間';
  end if;
  if p_duration_minutes not between 15 and 240 then
    raise exception '服務時間不正確';
  end if;

  select name into v_staff_name
  from public.staff
  where id = p_staff_id and active = true and accepting_reservations = true;
  if v_staff_name is null then
    raise exception '此館員目前不接受預約';
  end if;

  v_end_at := p_start_at + make_interval(mins => p_duration_minutes);

  if exists (
    select 1 from public.staff_unavailability u
    where u.staff_id = p_staff_id
      and (
        (coalesce(u.recurrence, '') <> 'weekly' and p_start_at < u.ends_at and v_end_at > u.starts_at)
        or
        (u.recurrence = 'weekly'
         and extract(dow from p_start_at) = extract(dow from u.starts_at)
         and (p_start_at::time < u.ends_at::time and v_end_at::time > u.starts_at::time))
      )
  ) then
    raise exception '此館員在該時段請假';
  end if;

  if exists (
    select 1 from public.reservations r
    where r.staff_id = p_staff_id
      and r.status not in ('completed', 'cancelled', 'rejected', '已完成', '已取消', '已拒絕')
      and p_start_at < r.ends_at and v_end_at > r.starts_at
  ) then
    raise exception '此時段已有其他預約';
  end if;

  insert into public.reservations(
    guest_name, staff_id, staff_name, service_name, price,
    starts_at, ends_at, note, status
  ) values (
    trim(p_guest_name), p_staff_id, v_staff_name, p_service_name, p_price,
    p_start_at, v_end_at, nullif(trim(coalesce(p_note, '')), ''), 'pending'
  ) returning id into v_id;

  return v_id;
end;
$function$;

notify pgrst, 'reload schema';

-- 舊公開 RPC 同樣只公開愛梨的排隊人數，不回傳相容用時間欄位。
CREATE OR REPLACE FUNCTION public.get_public_booking_data()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'slug', s.slug,
        'name', s.name,
        'role', s.role,
        'services', s.services,
        'sort_order', s.sort_order
      ) || case when s.slug='airi' then jsonb_build_object(
        'booking_mode','queue','queue_limit',5,
        'queue_count',(select count(*) from public.reservations q where q.staff_id=s.id and q.status in ('pending','acknowledged'))
      ) else '{}'::jsonb end order by s.sort_order)
      from public.staff s
      where s.active = true and s.accepting_reservations = true
    ), '[]'::jsonb),
    'blocks', coalesce((
      select jsonb_agg(x)
      from (
        select u.staff_id, u.starts_at as start_at, u.ends_at as end_at,
               u.recurrence, 'unavailable'::text as block_type
        from public.staff_unavailability u
        where not exists(select 1 from public.staff s where s.id=u.staff_id and s.slug='airi')
        union all
        select r.staff_id, r.starts_at as start_at, r.ends_at as end_at,
               null::text as recurrence, 'reservation'::text as block_type
        from public.reservations r
        where r.booking_mode<>'queue'
          and not exists(select 1 from public.staff s where s.id=r.staff_id and s.slug='airi')
          and r.status not in ('completed', 'cancelled', 'rejected', '已完成', '已取消', '已拒絕')
      ) x
    ), '[]'::jsonb)
  );
$function$;
