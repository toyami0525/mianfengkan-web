-- 眠楓館：前台點餐與預約正式串接修正
-- 請在 Supabase SQL Editor 執行一次。

create or replace function public.get_public_booking_data()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'role', s.role,
        'sort_order', s.sort_order
      ) order by s.sort_order)
      from public.staff s
      where s.active = true and s.accepting_reservations = true
    ), '[]'::jsonb),
    'blocks', coalesce((
      select jsonb_agg(x)
      from (
        select u.staff_id, u.starts_at as start_at, u.ends_at as end_at,
               u.recurrence, 'unavailable'::text as block_type
        from public.staff_unavailability u
        union all
        select r.staff_id, r.starts_at as start_at, r.ends_at as end_at,
               null::text as recurrence, 'reservation'::text as block_type
        from public.reservations r
        where r.status not in ('cancelled', 'rejected', '已取消', '已拒絕')
      ) x
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.get_public_booking_data() to anon, authenticated;

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
  v_staff_name text;
begin
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
      and r.status not in ('cancelled', 'rejected', '已取消', '已拒絕')
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
$$;

grant execute on function public.create_reservation(text, uuid, text, bigint, integer, timestamptz, text) to anon, authenticated;
