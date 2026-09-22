-- Independent Werewolf reservation requests. Existing orders/reservations/payroll are untouched.
create table public.werewolf_reservations (
  id bigint generated always as identity primary key,
  booking_code text generated always as ('WW-' || lpad(id::text,greatest(6,char_length(id::text)),'0')) stored unique,
  request_id uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  guest_name text not null check(char_length(btrim(guest_name)) between 1 and 80),
  guest_server text not null check(guest_server in ('伊弗利特','利維坦','巴哈姆特','泰坦','迦樓羅','鳳凰','奧汀')),
  contact text not null default '' check(char_length(contact)<=200),
  starts_at timestamptz not null,
  players integer not null check(players between 1 and 99),
  notes text not null default '' check(char_length(notes)<=2000),
  price integer not null default 500000 check(price=500000),
  status text not null default 'pending' check(status in ('pending','confirmed','completed','cancelled')),
  client_hash text not null check(client_hash ~ '^[0-9a-f]{64}$'),
  payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$')
);
create index werewolf_status_created on public.werewolf_reservations(status,created_at desc);
create index werewolf_client_created on public.werewolf_reservations(client_hash,created_at desc);
create unique index werewolf_unique_active_request on public.werewolf_reservations(guest_name,guest_server,starts_at) where status in ('pending','confirmed');
alter table public.werewolf_reservations enable row level security;
revoke all on public.werewolf_reservations from public,anon,authenticated;
revoke all on sequence public.werewolf_reservations_id_seq from public,anon,authenticated;
grant select on public.werewolf_reservations to authenticated;
create policy "owner reads werewolf requests" on public.werewolf_reservations for select to authenticated using ((select public.current_staff_role())='owner');

create function public.create_werewolf_reservation(
  p_request_id uuid,p_guest_name text,p_guest_server text,p_contact text,
  p_starts_at timestamptz,p_players integer,p_notes text,p_client_hash text,p_payload_hash text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare saved public.werewolf_reservations%rowtype; local_start timestamp;
begin
  -- One request ID = one submission, including network retries and parallel requests.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mf-ww-id:'||p_request_id::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mf-ww-client:'||p_client_hash,0));
  select * into saved from public.werewolf_reservations where request_id=p_request_id;
  if found then
    if saved.payload_hash is distinct from p_payload_hash then raise exception 'WW_RETRY'; end if;
    return jsonb_build_object('booking_code',saved.booking_code,'status',saved.status,'price',saved.price);
  end if;
  local_start:=p_starts_at at time zone 'Asia/Taipei';
  if p_starts_at is null or p_starts_at<=now() or local_start::time<time '21:00' then raise exception 'WW_TIME'; end if;
  if extract(isodow from local_start)=1 or exists(select 1 from public.venue_closures where work_date=local_start::date) then raise exception 'WW_CLOSED'; end if;
  if (select count(*) from public.werewolf_reservations where client_hash=p_client_hash and created_at>now()-interval '1 hour')>=5 then raise exception 'WW_RATE'; end if;
  insert into public.werewolf_reservations(request_id,guest_name,guest_server,contact,starts_at,players,notes,client_hash,payload_hash)
    values(p_request_id,btrim(p_guest_name),p_guest_server,btrim(p_contact),p_starts_at,p_players,btrim(p_notes),p_client_hash,p_payload_hash)
    returning * into saved;
  return jsonb_build_object('booking_code',saved.booking_code,'status',saved.status,'price',saved.price);
end;
$$;
revoke all on function public.create_werewolf_reservation(uuid,text,text,text,timestamptz,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.create_werewolf_reservation(uuid,text,text,text,timestamptz,integer,text,text,text) to service_role;

create function public.update_werewolf_reservation(p_id bigint,p_expected_status text,p_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare saved public.werewolf_reservations%rowtype;
begin
  if public.current_staff_role() is distinct from 'owner' then raise exception 'WW_OWNER' using errcode='42501'; end if;
  if not coalesce((p_expected_status='pending' and p_status in ('confirmed','cancelled')) or (p_expected_status='confirmed' and p_status in ('completed','cancelled')),false) then raise exception 'WW_TRANSITION'; end if;
  update public.werewolf_reservations set status=p_status,updated_at=now() where id=p_id and status=p_expected_status returning * into saved;
  if not found then raise exception 'WW_STALE'; end if;
  return jsonb_build_object('booking_code',saved.booking_code,'status',saved.status,'price',saved.price);
end;
$$;
revoke all on function public.update_werewolf_reservation(bigint,text,text) from public,anon,authenticated;
grant execute on function public.update_werewolf_reservation(bigint,text,text) to authenticated;
