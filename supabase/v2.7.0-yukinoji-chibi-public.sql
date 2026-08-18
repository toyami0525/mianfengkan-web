-- 眠楓館 v2.7.0：雪之寺羽狩 Q版繪圖(公版)
-- 1) 更新雪之寺羽狩館員介紹服務
-- 2) 新增獨立 Q版繪圖接單開關（預設接單中）
-- 3) 延伸原拍立得取件表，讓 Q版繪圖沿用同一套 MF-XXXXXX 取件流程

update public.staff
set services = array['枕邊談心','駐店繪師(公版)','拍立得']::text[],
    updated_at = now()
where slug = 'yukinoji-hakari' or name = '雪之寺羽狩';

insert into public.site_settings(key,value)
values ('yukinoji_chibi_accepting', jsonb_build_object('enabled', true))
on conflict (key) do nothing;

alter table public.polaroid_pickups
  add column if not exists item_type text not null default 'polaroid';

update public.polaroid_pickups
set item_type='polaroid'
where item_type is null or item_type='';

create index if not exists polaroid_pickups_item_type_idx
on public.polaroid_pickups(item_type);
