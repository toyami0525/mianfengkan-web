-- 眠楓館 v2.1.5：雪之寺羽狩館員介紹新增拍立得服務。
update public.staff
set services = array['泡湯搓澡','按摩','枕邊談心','拍立得']::text[],
    updated_at = now()
where slug = 'yukinoji-hakari' or name = '雪之寺羽狩';
