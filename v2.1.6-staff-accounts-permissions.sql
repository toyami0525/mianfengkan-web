-- 眠楓館 v2.1.6：館主／館員後台權限與個人指名通知
-- 執行前：請先在 Authentication > Users 建立對應 Email 帳號。

create table if not exists public.staff_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  staff_id uuid references public.staff(id) on delete set null,
  login_id text not null unique,
  role text not null default 'staff' check (role in ('owner','staff','frontdesk')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders add column if not exists staff_id uuid references public.staff(id) on delete set null;
create index if not exists staff_accounts_staff_id_idx on public.staff_accounts(staff_id);
create index if not exists reservations_staff_id_idx on public.reservations(staff_id);
create index if not exists orders_staff_id_idx on public.orders(staff_id);

alter table public.staff_accounts enable row level security;

-- 登入者只能讀取自己的帳號對照。
drop policy if exists "staff account read self" on public.staff_accounts;
create policy "staff account read self" on public.staff_accounts
for select to authenticated
using (user_id = auth.uid() and active = true);

-- 判斷目前登入者的身分，使用 SECURITY DEFINER 避免 RLS 遞迴。
create or replace function public.current_staff_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select role from public.staff_accounts
  where user_id = auth.uid() and active = true
  limit 1
$$;

create or replace function public.current_staff_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select staff_id from public.staff_accounts
  where user_id = auth.uid() and active = true
  limit 1
$$;

grant execute on function public.current_staff_role() to authenticated;
grant execute on function public.current_staff_id() to authenticated;

-- 移除舊版「所有已登入者都能看全部資料」政策。
drop policy if exists "admin staff all" on public.staff;
drop policy if exists "admin blocks all" on public.staff_unavailability;
drop policy if exists "admin reservations all" on public.reservations;
drop policy if exists "admin orders all" on public.orders;
drop policy if exists "admin announcements all" on public.announcements;
drop policy if exists "admin settings all" on public.site_settings;

-- 館主：完整權限；櫃台：處理預約／點餐；館員：只看與處理自己的資料。
create policy "owner manage staff" on public.staff for all to authenticated
using (public.current_staff_role() = 'owner')
with check (public.current_staff_role() = 'owner');
create policy "staff read own profile" on public.staff for select to authenticated
using (id = public.current_staff_id());
create policy "staff update own availability" on public.staff for update to authenticated
using (id = public.current_staff_id())
with check (id = public.current_staff_id());

create policy "owner manage blocks" on public.staff_unavailability for all to authenticated
using (public.current_staff_role() = 'owner')
with check (public.current_staff_role() = 'owner');
create policy "staff manage own blocks" on public.staff_unavailability for all to authenticated
using (staff_id = public.current_staff_id())
with check (staff_id = public.current_staff_id());

create policy "owner frontdesk read reservations" on public.reservations for select to authenticated
using (public.current_staff_role() in ('owner','frontdesk'));
create policy "staff read own reservations" on public.reservations for select to authenticated
using (staff_id = public.current_staff_id());
create policy "owner frontdesk update reservations" on public.reservations for update to authenticated
using (public.current_staff_role() in ('owner','frontdesk'))
with check (public.current_staff_role() in ('owner','frontdesk'));
create policy "staff update own reservations" on public.reservations for update to authenticated
using (staff_id = public.current_staff_id())
with check (staff_id = public.current_staff_id());
create policy "owner delete reservations" on public.reservations for delete to authenticated
using (public.current_staff_role() = 'owner');

create policy "owner frontdesk read orders" on public.orders for select to authenticated
using (public.current_staff_role() in ('owner','frontdesk'));
create policy "staff read own orders" on public.orders for select to authenticated
using (staff_id = public.current_staff_id());
create policy "owner frontdesk update orders" on public.orders for update to authenticated
using (public.current_staff_role() in ('owner','frontdesk'))
with check (public.current_staff_role() in ('owner','frontdesk'));
create policy "staff update own orders" on public.orders for update to authenticated
using (staff_id = public.current_staff_id())
with check (staff_id = public.current_staff_id());
create policy "owner delete orders" on public.orders for delete to authenticated
using (public.current_staff_role() = 'owner');

create policy "owner announcements all" on public.announcements for all to authenticated
using (public.current_staff_role() = 'owner')
with check (public.current_staff_role() = 'owner');
create policy "owner settings all" on public.site_settings for all to authenticated
using (public.current_staff_role() = 'owner')
with check (public.current_staff_role() = 'owner');

-- 將已建立的 Supabase Auth 使用者綁定至館員。
-- 沒有建立的帳號會自動略過，之後可再次執行本段。
with account_map(email,login_id,staff_slug,account_role) as (
 values
 ('rikyu@mianfengkan.local','羽鶴璃久','riku','owner'),
 ('musufiru@mianfengkan.local','慕斯菲露','musufiru','staff'),
 ('yukinoji@mianfengkan.local','雪之寺羽狩','yukinoji-hakari','staff'),
 ('shenaixue@mianfengkan.local','神噯雪','shenaixue','staff'),
 ('zixuan@mianfengkan.local','子瑄','zixuan','staff'),
 ('wei@mianfengkan.local','微','wei','staff'),
 ('hanagata@mianfengkan.local','花形','hanagata','staff'),
 ('qijiu@mianfengkan.local','栖酒','qijiu','staff'),
 ('honghong@mianfengkan.local','轟轟轟太大風','honghong','staff'),
 ('gelin@mianfengkan.local','格林','grin','staff')
)
insert into public.staff_accounts(user_id,staff_id,login_id,role,active)
select u.id,s.id,m.login_id,m.account_role,true
from account_map m
join auth.users u on lower(u.email)=lower(m.email)
left join public.staff s on s.slug=m.staff_slug
on conflict(user_id) do update set
 staff_id=excluded.staff_id,
 login_id=excluded.login_id,
 role=excluded.role,
 active=true,
 updated_at=now();

-- Realtime：確保 reservations 可發送 INSERT 事件。
do $$ begin
  alter publication supabase_realtime add table public.reservations;
exception when duplicate_object then null;
end $$;

select login_id,role,staff_id,active from public.staff_accounts order by role,login_id;
