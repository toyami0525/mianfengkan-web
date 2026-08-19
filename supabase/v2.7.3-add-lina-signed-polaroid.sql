-- 眠楓館 v2.7.3：新增 Lina「簽繪拍立得」
-- 定價 150,000 Gil、系統服務時間 15 分鐘、每日（Asia/Taipei）限量 3 張。
-- 每日限量由資料庫 trigger 強制執行，避免多人同時送出造成第 4 張超賣。

insert into public.staff(
  name, role, slug, services, active, accepting_reservations, sort_order, updated_at
)
values (
  'Lina', '館員', 'lina', array['簽繪拍立得']::text[], true, true, 100, now()
)
on conflict (slug) do update set
  name = excluded.name,
  role = excluded.role,
  services = excluded.services,
  active = true,
  accepting_reservations = true,
  sort_order = excluded.sort_order,
  updated_at = now();

create index if not exists polaroid_pickups_item_type_created_at_idx
  on public.polaroid_pickups(item_type, created_at);

create or replace function public.enforce_lina_signed_polaroid_daily_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service_date date;
  v_start timestamptz;
  v_end timestamptz;
  v_count integer;
begin
  if new.item_type <> 'lina_signed_polaroid' then
    return new;
  end if;

  v_service_date := (coalesce(new.created_at, now()) at time zone 'Asia/Taipei')::date;
  v_start := v_service_date::timestamp at time zone 'Asia/Taipei';
  v_end := (v_service_date + 1)::timestamp at time zone 'Asia/Taipei';

  -- 同一天的 Lina 名額使用同一把交易鎖，確保並發時也最多只會成功 3 筆。
  perform pg_advisory_xact_lock(hashtextextended('mianfengkan:lina-signed:' || v_service_date::text, 0));

  select count(*) into v_count
  from public.polaroid_pickups
  where item_type = 'lina_signed_polaroid'
    and created_at >= v_start
    and created_at < v_end;

  if v_count >= 3 then
    raise exception 'Lina 簽繪拍立得今日已達 3 張上限';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_lina_signed_polaroid_daily_limit on public.polaroid_pickups;
create trigger trg_lina_signed_polaroid_daily_limit
before insert on public.polaroid_pickups
for each row
execute function public.enforce_lina_signed_polaroid_daily_limit();
