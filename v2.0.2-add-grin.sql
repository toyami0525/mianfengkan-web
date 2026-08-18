-- 眠楓館 v2.0.2：新增館員「格林」。
-- 可重複執行，不會刪除既有指名、點餐或館員資料。

insert into public.staff (
  name, role, slug, bio, quote, services,
  active, accepting_reservations, sort_order
)
values (
  '格林',
  '館員',
  'grin',
  '出身不明的敖龍族少女，於和風溫泉會館工作。喜歡閱讀與寫作，總將旅人的故事悄悄收藏進字裡行間。性格如小狗般黏人，害怕寂寞，也害怕被拋棄，總是容易紅了眼眶。',
  '「若您不介意，還請在停留於溫泉會館的時光裡，與我分享屬於您的故事。」',
  array['泡湯搓澡','按摩','枕邊談心']::text[],
  true,
  true,
  60
)
on conflict (slug) do update set
  name = excluded.name,
  role = excluded.role,
  bio = excluded.bio,
  quote = excluded.quote,
  services = excluded.services,
  active = excluded.active,
  accepting_reservations = excluded.accepting_reservations,
  sort_order = excluded.sort_order,
  updated_at = now();

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
        'slug', s.slug,
        'name', s.name,
        'role', s.role,
        'services', s.services,
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
