-- A private draft. Only the authenticated owner API can manage it or issue gifts.
-- No customer-facing content is returned until both switches and dates allow it.
create table public.halloween_campaigns (
  id text primary key check (id = 'airi-halloween-2026'),
  enabled boolean not null default false,
  published boolean not null default false,
  starts_on date,
  ends_on date,
  updated_at timestamptz not null default now(),
  check (starts_on is null or ends_on is null or starts_on <= ends_on),
  check (not enabled or (starts_on is not null and ends_on is not null)),
  check (not published or enabled)
);
insert into public.halloween_campaigns(id) values ('airi-halloween-2026');

create table public.halloween_reward_claims (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null references public.halloween_campaigns(id),
  spend_date date not null,
  guest_name text not null check (char_length(guest_name) between 1 and 80),
  guest_server text not null check (char_length(guest_server) between 1 and 60),
  guest_key text not null,
  server_key text not null,
  qualifying_total bigint not null check (qualifying_total >= 400000),
  pickup_id uuid not null unique references public.polaroid_pickups(id),
  issued_by uuid not null references auth.users(id),
  issued_at timestamptz not null default now(),
  constraint halloween_reward_claims_daily_guest_key unique
    (campaign_id, spend_date, guest_key, server_key)
);

alter table public.halloween_campaigns enable row level security;
alter table public.halloween_reward_claims enable row level security;
revoke all on public.halloween_campaigns, public.halloween_reward_claims from public, anon, authenticated;
grant select, insert, update, delete on public.halloween_campaigns, public.halloween_reward_claims to service_role;

-- Bound daily scans by timestamps instead of applying a timezone function to
-- every source row. Existing business-day/payroll calculations are unaffected.
create index reservations_completed_spend_date_idx on public.reservations(created_at)
  where status in ('completed','已完成');
create index orders_completed_spend_date_idx on public.orders(created_at)
  where status in ('completed','已完成');
create index werewolf_completed_spend_date_idx on public.werewolf_reservations(starts_at)
  where status = 'completed';

create function public.halloween_normalize_label(value text) returns text
language sql immutable security invoker set search_path = '' as $$
  select btrim(regexp_replace(normalize(coalesce(value,''), NFKC), '\s+', ' ', 'g'));
$$;

-- Preserve legacy item JSON while excluding tips, donations and invalid values.
-- Pickup records are delivery records, never additional spending.
create function public.halloween_order_spend(p_items jsonb, p_total bigint) returns bigint
language plpgsql immutable security invoker set search_path = '' as $$
declare items jsonb := p_items; item jsonb; amount numeric := 0; quantity numeric; unit_price numeric;
begin
  if jsonb_typeof(items) = 'string' then
    begin items := (items #>> '{}')::jsonb;
    exception when invalid_text_representation then items := null; end;
  end if;
  if items is null or jsonb_typeof(items) <> 'array' then
    return greatest(coalesce(p_total,0),0);
  end if;
  if jsonb_array_length(items) = 0 then return greatest(coalesce(p_total,0),0); end if;
  for item in select value from jsonb_array_elements(items) loop
    if coalesce(item->>'name','') ~* '(打賞|小費|tip|tips|donation|贊助)' then continue; end if;
    if coalesce(item->>'price','') !~ '^[0-9]+$' then continue; end if;
    if coalesce(item->>'qty','1') !~ '^[0-9]+$' then continue; end if;
    unit_price := (item->>'price')::numeric;
    quantity := coalesce(item->>'qty','1')::numeric;
    amount := amount + unit_price * quantity;
  end loop;
  if amount > 9007199254740991 then raise exception '消費金額過大，請先核對原始訂單'; end if;
  return amount::bigint;
end;
$$;

create function public.halloween_daily_spend(p_spend_date date)
returns table (
  guest_name text, guest_server text, guest_key text, server_key text,
  reservation_total bigint, dining_total bigint, game_total bigint, total bigint
)
language sql stable security invoker set search_path = '' as $$
  with bounds as (
    select p_spend_date::timestamp at time zone 'Asia/Taipei' as starts_at,
      (p_spend_date + 1)::timestamp at time zone 'Asia/Taipei' as ends_at
  ), entries as (
    select r.guest_name, r.guest_server,
      greatest(coalesce(r.price,0),0)::bigint as reservation_total,
      0::bigint as dining_total, 0::bigint as game_total
    from public.reservations r cross join bounds b
    where r.created_at >= b.starts_at and r.created_at < b.ends_at
      and r.status in ('completed','已完成')
      and coalesce(r.service_name,'') !~* '(打賞|小費|tip|tips|donation|贊助)'
    union all
    select o.guest_name, o.guest_server, 0::bigint,
      public.halloween_order_spend(o.items,o.total), 0::bigint
    from public.orders o cross join bounds b
    where o.created_at >= b.starts_at and o.created_at < b.ends_at
      and o.status in ('completed','已完成')
    union all
    select w.guest_name, w.guest_server, 0::bigint, 0::bigint,
      greatest(coalesce(w.price,0),0)::bigint
    from public.werewolf_reservations w cross join bounds b
    where w.starts_at >= b.starts_at and w.starts_at < b.ends_at
      and w.status = 'completed'
  ), normalized as (
    select public.halloween_normalize_label(e.guest_name) as guest_name,
      public.halloween_normalize_label(e.guest_server) as guest_server,
      e.reservation_total,e.dining_total,e.game_total
    from entries e
  )
  select min(n.guest_name), min(n.guest_server), lower(n.guest_name), lower(n.guest_server),
    sum(n.reservation_total)::bigint, sum(n.dining_total)::bigint, sum(n.game_total)::bigint,
    sum(n.reservation_total+n.dining_total+n.game_total)::bigint
  from normalized n
  where n.guest_name <> ''
  group by lower(n.guest_name), lower(n.guest_server)
  having sum(n.reservation_total+n.dining_total+n.game_total) > 0
  order by sum(n.reservation_total+n.dining_total+n.game_total) desc, min(n.guest_name), min(n.guest_server);
$$;

-- Gift and claim are written atomically. The campaign row lock serializes
-- issuance with both duplicate requests and changes to the enable/date settings.
create function public.issue_halloween_reward(
  p_guest_name text, p_guest_server text, p_spend_date date,
  p_issued_by uuid, p_pickup_code text
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  config public.halloween_campaigns%rowtype;
  existing public.halloween_reward_claims%rowtype;
  spend record;
  recipient public.staff%rowtype;
  target_name_key text := lower(public.halloween_normalize_label(p_guest_name));
  target_server_key text := lower(public.halloween_normalize_label(p_guest_server));
  pickup_id uuid;
  claim_id uuid;
  issued_time timestamptz := clock_timestamp();
  code text;
begin
  if not exists (select 1 from public.staff_accounts a
    where a.user_id=p_issued_by and a.active and a.role='owner') then
    raise exception '只有館主可以發放活動贈品' using errcode='P0001';
  end if;
  if target_name_key='' or target_server_key='' or char_length(public.halloween_normalize_label(p_guest_name))>80
    or char_length(public.halloween_normalize_label(p_guest_server))>60 then
    raise exception '請完整核對客人名稱與伺服器' using errcode='P0001';
  end if;
  if p_spend_date is null or p_spend_date > (now() at time zone 'Asia/Taipei')::date then
    raise exception '只能發放今日或已結束日期的活動贈品' using errcode='P0001';
  end if;
  select * into config from public.halloween_campaigns c
    where c.id='airi-halloween-2026' for update;
  if not found then raise exception '活動設定尚未建立' using errcode='P0001'; end if;

  select * into existing from public.halloween_reward_claims c
    where c.campaign_id=config.id and c.spend_date=p_spend_date
      and c.guest_key=target_name_key and c.server_key=target_server_key;
  if found then
    select p.pickup_code into code from public.polaroid_pickups p where p.id=existing.pickup_id;
    return jsonb_build_object('id',existing.id,'spend_date',existing.spend_date,
      'guest_name',existing.guest_name,'guest_server',existing.guest_server,
      'total',existing.qualifying_total,'pickup_id',existing.pickup_id,
      'pickup_code',code,'issued_at',existing.issued_at,'already_issued',true);
  end if;
  if not config.enabled or config.starts_on is null or config.ends_on is null then
    raise exception '活動尚未啟用，目前只可預覽' using errcode='P0001';
  end if;
  if p_spend_date < config.starts_on or p_spend_date > config.ends_on then
    raise exception '此日期不在活動期間內' using errcode='P0001';
  end if;
  if p_pickup_code is null or p_pickup_code !~ '^MF-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$' then
    raise exception '取件碼格式不正確' using errcode='P0001';
  end if;
  select * into spend from public.halloween_daily_spend(p_spend_date) s
    where s.guest_key=target_name_key and s.server_key=target_server_key;
  if not found then raise exception '查無此客人當日已完成消費' using errcode='P0001'; end if;
  if spend.total < 400000 then
    raise exception '當日已完成消費尚未達 400,000 Gil' using errcode='P0001';
  end if;
  select * into recipient from public.staff where slug='airi';
  if not found then raise exception '找不到愛梨的館員資料' using errcode='P0001'; end if;

  insert into public.polaroid_pickups
    (reservation_id,staff_id,staff_name,guest_name,guest_server,pickup_code,status,item_type)
  values (null,recipient.id,recipient.name,spend.guest_name,spend.guest_server,
    p_pickup_code,'processing','airi_halloween_signed_polaroid')
  returning id into pickup_id;
  insert into public.halloween_reward_claims
    (campaign_id,spend_date,guest_name,guest_server,guest_key,server_key,
      qualifying_total,pickup_id,issued_by,issued_at)
  values (config.id,p_spend_date,spend.guest_name,spend.guest_server,target_name_key,target_server_key,
    spend.total,pickup_id,p_issued_by,issued_time)
  returning id into claim_id;
  return jsonb_build_object('id',claim_id,'spend_date',p_spend_date,
    'guest_name',spend.guest_name,'guest_server',spend.guest_server,'total',spend.total,
    'pickup_id',pickup_id,'pickup_code',p_pickup_code,'issued_at',issued_time,'already_issued',false);
end;
$$;

revoke all on function public.halloween_normalize_label(text),
  public.halloween_order_spend(jsonb,bigint), public.halloween_daily_spend(date),
  public.issue_halloween_reward(text,text,date,uuid,text) from public, anon, authenticated;
grant execute on function public.halloween_normalize_label(text),
  public.halloween_order_spend(jsonb,bigint), public.halloween_daily_spend(date),
  public.issue_halloween_reward(text,text,date,uuid,text) to service_role;
notify pgrst, 'reload schema';
