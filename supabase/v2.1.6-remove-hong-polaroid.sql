-- 眠楓館 v2.1.6：僅移除轟轟轟太大風館員介紹中的拍立得服務。
update public.staff
set services = array['泡湯搓澡','按摩','枕邊談心']::text[],
    updated_at = now()
where slug = 'hong-hong-hong-taidafeng' or name = '轟轟轟太大風';
