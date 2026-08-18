-- 眠楓館 v2.5.4：希望送餐館員＋送餐接單

alter table public.orders add column if not exists delivery_preference_staff_id uuid references public.staff(id) on delete set null;
alter table public.orders add column if not exists delivery_preference_staff_name text;
alter table public.orders add column if not exists delivery_staff_id uuid references public.staff(id) on delete set null;
alter table public.orders add column if not exists delivery_staff_name text;
alter table public.orders add column if not exists delivery_claimed_at timestamptz;

create index if not exists orders_delivery_preference_staff_id_idx on public.orders(delivery_preference_staff_id);
create index if not exists orders_delivery_staff_id_idx on public.orders(delivery_staff_id);

-- 點餐屬於全館共同工作：所有已登入館員皆可看見與處理餐點訂單，
-- 才能在希望館員忙碌時由其他館員代為送餐。
drop policy if exists "staff read own orders" on public.orders;
drop policy if exists "staff update own orders" on public.orders;
drop policy if exists "staff read all orders" on public.orders;
drop policy if exists "staff update all orders" on public.orders;
create policy "staff read all orders" on public.orders for select to authenticated
using (public.current_staff_role() = 'staff');
create policy "staff update all orders" on public.orders for update to authenticated
using (public.current_staff_role() = 'staff')
with check (public.current_staff_role() = 'staff');

-- Realtime 若已加入 publication 會自動忽略 duplicate_object。
do $$ begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null;
end $$;

select id,guest_name,delivery_preference_staff_name,delivery_staff_name,status,created_at
from public.orders order by created_at desc limit 20;
