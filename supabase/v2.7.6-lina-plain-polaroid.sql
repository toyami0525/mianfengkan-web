-- 眠楓館 v2.7.6：Lina 新增「拍立得(無簽繪)」
-- 價格 80,000 Gil；不受簽繪拍立得每日 3 張限制。

insert into public.staff(
  name, role, slug, services, active, accepting_reservations, sort_order, updated_at
)
values (
  'Lina', '館員', 'lina', array['簽繪拍立得','拍立得(無簽繪)']::text[], true, true, 100, now()
)
on conflict (slug) do update set
  name = excluded.name,
  role = excluded.role,
  services = excluded.services,
  active = true,
  accepting_reservations = true,
  sort_order = excluded.sort_order,
  updated_at = now();
