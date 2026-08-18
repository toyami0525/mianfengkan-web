-- 眠楓館 v2.1.3：新增神噯雪、子瑄，更新館員服務。
-- 可重複執行，不會刪除既有訂單或預約。

update public.staff set services=array['泡湯搓澡','按摩','枕邊談心','拍立得']::text[], updated_at=now()
where slug='yukinoji-hakari' or name='雪之寺羽狩';
update public.staff set services=array['泡湯搓澡','按摩','枕邊談心']::text[], updated_at=now()
where slug='hong-hong-hong-taidafeng' or name='轟轟轟太大風';

insert into public.staff(name,role,slug,bio,quote,services,active,accepting_reservations,sort_order)
values
('神噯雪','館員','shenaixue','我是拳聖・哈蒙，對你非常信任，因此有一事相求！','「如果在艾歐澤亞發現了性感辣妹的話，記得向我匯報！！」',array['枕邊談心']::text[],true,true,70),
('子瑄','館員','zixuan','一隻喜歡閃亮亮收藏品的小貓，總是會被漂亮的東西吸引走。

如今在一間靜謐的日式湯屋擔任招待，喜歡替每位旅人準備暖暖的湯泉與放鬆的時光。輕柔的水聲、淡淡的木香，都是瑄瑄最喜歡的日常。

雖然偶爾有些迷糊，卻總會帶著笑容迎接每一位來訪的主人。

願每位踏入湯屋的旅人，都能卸下疲憊，在溫暖的湯屋時光中放鬆身心，帶著笑容離開。','「今晚也請讓瑄瑄陪您度過一段放鬆又溫暖的時光 喵♡」',array['泡湯搓澡','按摩','枕邊談心']::text[],true,true,80)
on conflict(slug) do update set name=excluded.name,role=excluded.role,bio=excluded.bio,quote=excluded.quote,services=excluded.services,active=true,accepting_reservations=true,sort_order=excluded.sort_order,updated_at=now();
