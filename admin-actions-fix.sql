-- 眠楓館 v1.2：修正後台「完成／取消／確認」按鈕無反應
-- 請在 Supabase SQL Editor 執行一次。

-- 確保已登入的管理員具備資料表操作權限。
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.orders to authenticated;
grant select, insert, update, delete on table public.reservations to authenticated;
grant select, insert, update, delete on table public.staff to authenticated;
grant select, insert, update, delete on table public.staff_unavailability to authenticated;
grant select, insert, update, delete on table public.announcements to authenticated;
grant select, insert, update, delete on table public.site_settings to authenticated;

-- 重建明確的管理員政策，避免舊政策未建立完整或名稱衝突。
drop policy if exists "admin orders all" on public.orders;
create policy "admin orders all" on public.orders
for all to authenticated
using (true)
with check (true);

drop policy if exists "admin reservations all" on public.reservations;
create policy "admin reservations all" on public.reservations
for all to authenticated
using (true)
with check (true);

drop policy if exists "admin staff all" on public.staff;
create policy "admin staff all" on public.staff
for all to authenticated
using (true)
with check (true);

drop policy if exists "admin blocks all" on public.staff_unavailability;
create policy "admin blocks all" on public.staff_unavailability
for all to authenticated
using (true)
with check (true);

drop policy if exists "admin announcements all" on public.announcements;
create policy "admin announcements all" on public.announcements
for all to authenticated
using (true)
with check (true);

drop policy if exists "admin settings all" on public.site_settings;
create policy "admin settings all" on public.site_settings
for all to authenticated
using (true)
with check (true);
