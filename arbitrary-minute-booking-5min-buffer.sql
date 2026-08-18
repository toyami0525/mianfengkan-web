-- 眠楓館 v1.6：當日任意分鐘指名＋服務結束後 5 分鐘緩衝
-- 範例：21:11 開始 15 分鐘，21:26 結束；同一館員下一筆最早可於 21:31 開始。
-- 請在 Supabase SQL Editor 執行一次。

create or replace function public.create_reservation(
  p_guest_name text,
  p_staff_id uuid,
  p_service_name text,
  p_price bigint,
  p_duration_minutes integer,
  p_start_at timestamptz,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_end_at timestamptz;
  v_buffered_end_at timestamptz;
  v_staff_name text;
  v_taipei_start timestamp;
  v_taipei_end timestamp;
  v_taipei_now timestamp;
begin
  if trim(coalesce(p_guest_name, '')) = '' then
    raise exception '請填寫客人名稱';
  end if;
  if p_duration_minutes not between 15 and 240 then
    raise exception '服務時間不正確';
  end if;

  v_end_at := p_start_at + make_interval(mins => p_duration_minutes);
  v_buffered_end_at := v_end_at + interval '5 minutes';
  v_taipei_start := p_start_at at time zone 'Asia/Taipei';
  v_taipei_end := v_end_at at time zone 'Asia/Taipei';
  v_taipei_now := now() at time zone 'Asia/Taipei';

  if v_taipei_start::date <> v_taipei_now::date then
    raise exception '指名僅限當天，不能預約其他日期';
  end if;
  if p_start_at <= now() then
    raise exception '不可指名已經過去的時間';
  end if;
  if extract(second from v_taipei_start) <> 0 then
    raise exception '開始時間請以分鐘為單位';
  end if;
  if v_taipei_start::time < time '21:00'
     or v_taipei_end::date <> v_taipei_start::date
     or v_taipei_end::time > time '23:59:59.999999' then
    raise exception '可指名時間為當天 21:00～24:00，服務必須在午夜 12 點前結束';
  end if;

  select name into v_staff_name
  from public.staff
  where id = p_staff_id and active = true and accepting_reservations = true;
  if v_staff_name is null then
    raise exception '此館員目前不接受預約';
  end if;

  if exists (
    select 1 from public.staff_unavailability u
    where u.staff_id = p_staff_id
      and (
        (coalesce(u.recurrence, '') <> 'weekly' and p_start_at < u.ends_at and v_end_at > u.starts_at)
        or
        (u.recurrence = 'weekly'
         and extract(dow from p_start_at at time zone 'Asia/Taipei') = extract(dow from u.starts_at at time zone 'Asia/Taipei')
         and ((p_start_at at time zone 'Asia/Taipei')::time < (u.ends_at at time zone 'Asia/Taipei')::time
              and (v_end_at at time zone 'Asia/Taipei')::time > (u.starts_at at time zone 'Asia/Taipei')::time))
      )
  ) then
    raise exception '此館員在該時段請假';
  end if;

  -- 對同一館員，兩筆有效指名之間必須保留完整 5 分鐘。
  -- 對既有預約在前：新開始時間 >= 既有結束時間 + 5 分鐘。
  -- 對新預約在前：新結束時間 + 5 分鐘 <= 既有開始時間。
  if exists (
    select 1 from public.reservations r
    where r.staff_id = p_staff_id
      and r.status not in ('cancelled', 'rejected', '已取消', '已拒絕')
      and p_start_at < r.ends_at + interval '5 minutes'
      and v_buffered_end_at > r.starts_at
  ) then
    raise exception '此時間與其他指名或其後 5 分鐘緩衝時間重疊';
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
$$;

grant execute on function public.create_reservation(text, uuid, text, bigint, integer, timestamptz, text) to anon, authenticated;
