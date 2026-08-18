-- 眠楓館 v2.0.1：新增轟轟轟太大風並更新館員服務項目。
-- 可重複執行，不會刪除既有指名與點餐紀錄。

insert into public.staff (
  name, role, slug, bio, quote, services,
  active, accepting_reservations, sort_order
)
values (
  '轟轟轟太大風',
  '館員',
  'hong-hong-hong-taidafeng',
  '異國的敖龍少女，言語相似亦相異，煩請各位客人稍等少女組織言語呢。遠似冰，近似火，深愛恐怖亦疼愛可愛。以反差為萌點（自稱）的敖龍少女期待與各位客人在眠楓館共創美好回憶。',
  '「觀迎光臨～又辛苦一天了呢～今天要先進餐～？先泡澡～？還是……全都要～？$$$」',
  array['泡湯搓澡','按摩','枕邊談心','拍立得']::text[],
  true,
  true,
  50
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

update public.staff
set services = array['泡湯搓澡','按摩','枕邊談心']::text[],
    active = true,
    accepting_reservations = true,
    updated_at = now()
where slug = 'wei' or name = '微';

update public.staff
set services = array['泡湯搓澡','按摩','枕邊談心','小遊戲','拍立得']::text[],
    active = true,
    accepting_reservations = true,
    updated_at = now()
where slug = 'musufiru' or name = '慕斯菲露';

update public.staff
set services = array['泡湯搓澡','按摩','枕邊談心']::text[],
    active = true,
    accepting_reservations = true,
    updated_at = now()
where slug = 'yukinoji-hakari' or name = '雪之寺羽狩';

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
