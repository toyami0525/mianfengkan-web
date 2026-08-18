-- 眠楓館 v1.9.2：新增慕斯菲露與雪之寺羽狩，並更新微的館員台詞。
-- 可重複執行；不會刪除既有指名或點餐紀錄。

insert into public.staff (
  name, role, slug, bio, quote, services,
  active, accepting_reservations, sort_order
)
values
(
  '慕斯菲露',
  '館員',
  'musufiru',
  '古典為底，玩心作陪，風雅是外衣，小小捉弄是藏不住的餘興。待客從容，卻不愛過分奉承，若肯配合一點，這段時光大概會很有趣。',
  '「旅人似浮雲，入館坐一席。至於這片刻怎麼過，客倌可得小心交給我。」',
  array['泡湯搓澡','按摩','枕邊談心','小遊戲']::text[],
  true,
  true,
  30
),
(
  '雪之寺羽狩',
  '館員',
  'yukinoji-hakari',
  '黃金港忍者部隊退役的優閒忍者，沒事就會參與狩獵怪物的傭兵招募，最喜歡的事情是揮舞雙刃享受戰鬥，今天也會用25萬的傷害給客人的雙肩來上一場華麗的按摩。',
  '「活殺自在、地之印、人之印、冰晶亂流之術！客人，還有哪裡需要加強嗎？……客、客人？」',
  array['泡湯搓澡','按摩','枕邊談心']::text[],
  true,
  true,
  40
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
set
  quote = '「小璃！錢錢！沒有……加薪！～加薪！～」',
  active = true,
  accepting_reservations = true,
  updated_at = now()
where slug = 'wei' or name = '微';

update public.staff
set
  active = true,
  accepting_reservations = false,
  updated_at = now()
where slug = 'riku' or name = '羽鶴璃久';

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
