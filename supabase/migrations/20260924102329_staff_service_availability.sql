-- Independent switches preserve the permanent staff profile and existing bookings.
create table public.staff_service_availability (
  staff_id uuid not null references public.staff(id) on delete cascade,
  service_name text not null check (service_name in (
    '泡湯洗浴','按摩服務','耳語陪伴','Q版繪圖(公版)',
    '簽繪拍立得','拍立得(無簽繪)','紀念拍立得'
  )),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (staff_id, service_name)
);
alter table public.staff_service_availability enable row level security;
revoke all on public.staff_service_availability from anon, authenticated;
grant select on public.staff_service_availability to anon, authenticated;
grant insert, update, delete on public.staff_service_availability to authenticated;
grant all on public.staff_service_availability to service_role;
create policy "read service availability" on public.staff_service_availability
  for select to anon, authenticated using (true);
create policy "owner manages service availability" on public.staff_service_availability
  for all to authenticated
  using ((select public.current_staff_role()) = 'owner')
  with check ((select public.current_staff_role()) = 'owner');

-- Retain the artist's current setting when moving both controls to this table.
insert into public.staff_service_availability(staff_id,service_name,enabled)
select s.id,'Q版繪圖(公版)',coalesce(v.value = 'true'::jsonb or v.value->>'enabled' = 'true',false)
from public.staff s cross join public.site_settings v
where s.slug='yukinoji-hakari' and v.key='yukinoji_chibi_accepting';

create function public.normalize_booking_service(name text) returns text
language sql immutable set search_path = '' as $$
  select case btrim(name)
    when '泡湯搓澡' then '泡湯洗浴'
    when '按摩' then '按摩服務'
    when '枕邊談心' then '耳語陪伴'
    when '駐店繪師(公版)' then 'Q版繪圖(公版)'
    when '拍立得' then '紀念拍立得'
    else btrim(name) end;
$$;

-- Serialize a switch with new bookings for the same staff member, including
-- bookings made through older clients or the public create_reservation RPC.
create function public.lock_staff_service_availability() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op='UPDATE' and (new.staff_id is distinct from old.staff_id or new.service_name is distinct from old.service_name) then
    raise exception '不可變更服務開關所屬的館員或項目';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mf-service:' || coalesce(new.staff_id,old.staff_id)::text,0));
  if tg_op='DELETE' then return old; end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger lock_staff_service_availability
  before insert or update or delete on public.staff_service_availability
  for each row execute function public.lock_staff_service_availability();

create function public.guard_paused_reservation_services() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare requested text[]; paused text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mf-service:' || new.staff_id::text,0));
  select array_agg(public.normalize_booking_service(part)) into requested
    from regexp_split_to_table(coalesce(new.service_name,''),'[＋+、]') part;
  if '眠楓套席'=any(requested) then requested:=requested||array['泡湯洗浴','按摩服務','耳語陪伴']; end if;
  if coalesce(new.note,'') like '%包含：%紀念拍立得%' then requested:=requested||array['紀念拍立得']; end if;
  select string_agg(service_name,'、' order by service_name) into paused
  from public.staff_service_availability
  where staff_id=new.staff_id and enabled=false and service_name=any(requested);
  if paused is not null then
    raise exception '此館員的「%」目前暫停提供，請重新選擇服務。',paused using errcode='P0001';
  end if;
  return new;
end;
$$;
create trigger guard_paused_reservation_services before insert on public.reservations
  for each row execute function public.guard_paused_reservation_services();

revoke all on function public.lock_staff_service_availability() from public, anon, authenticated;
revoke all on function public.guard_paused_reservation_services() from public, anon, authenticated;
notify pgrst, 'reload schema';
