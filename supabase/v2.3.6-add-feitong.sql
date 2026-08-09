-- 眠楓館 v2.3.6：新增館員「緋瞳」。可重複執行。
insert into public.staff (name, role, slug, bio, quote, services, active, accepting_reservations, sort_order)
values (
  '緋瞳','館員','feitong',
  '十分年幼的敖龍族孩子，元氣十足、總是蹦蹦跳跳的，對於任何事情都有著強烈的好奇心～ 其中最喜歡穿搭．．．以及．．．噓～不可以在這裡說 ♥ 個性古靈精怪，偶爾還有些調皮搗蛋，但絕對！絕對！是個好孩子唷 ！',
  '「呀齁～♥   就看我咻咻地把顧客您的不開心、不舒服全部都解決掉吧！嘻嘻 ✧*｡٩( ꈍᴗꈍ)و 猛擊！星遁天珠！、猛擊！星遁天珠！、猛擊！星遁天珠！」',
  array['泡湯搓澡','按摩','枕邊談心']::text[], true, true, 90
)
on conflict (slug) do update set name=excluded.name,role=excluded.role,bio=excluded.bio,quote=excluded.quote,services=excluded.services,active=excluded.active,accepting_reservations=excluded.accepting_reservations,sort_order=excluded.sort_order,updated_at=now();
