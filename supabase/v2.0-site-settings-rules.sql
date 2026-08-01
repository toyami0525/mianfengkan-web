-- 眠楓館 v2.0：網站設定與規章後台
-- 可重複執行，不會刪除既有資料。

insert into public.site_settings(key,value)
values
('venue', jsonb_build_object(
  'name','眠楓館',
  'address','穹頂皓天 7區22號',
  'discord','',
  'business_status','open',
  'business_hours','依招募板公告為主'
)),
('homepage', jsonb_build_object(
  'tagline','在楓影與湯煙之間，靜候旅人安歇。',
  'services_text','和風溫泉會館　食・湯・癒・眠'
)),
('rules', jsonb_build_array(
  jsonb_build_object('title','尊重館員與每位旅人','content','請尊重館員及其他來館旅人的交流空間，避免任何騷擾、惡意言論或影響他人體驗的行為。'),
  jsonb_build_object('title','館內請放慢腳步','content','請避免於館內奔跑、跳躍或持續使用大型特效技能，共同維護寧靜舒適的環境。'),
  jsonb_build_object('title','拍照請先徵詢同意','content','若欲與館員或其他旅人拍照、合影或錄影，請先取得對方同意後再進行。'),
  jsonb_build_object('title','尊重館員的服務安排','content','每位館員可依現場狀況調整服務內容或婉拒部分服務，敬請理解並予以尊重。'),
  jsonb_build_object('title','共同維護館內環境','content','請避免長時間占用公共空間、刻意干擾他人或影響館內秩序，共同維護舒適的休憩環境。'),
  jsonb_build_object('title','如有任何需求','content','若有任何問題或需要協助，歡迎隨時向館員提出，我們將竭誠為您服務。')
))
on conflict(key) do nothing;

alter table public.site_settings enable row level security;

do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='site_settings' and policyname='public read settings') then
    create policy "public read settings" on public.site_settings for select using(true);
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='site_settings' and policyname='admin settings all') then
    create policy "admin settings all" on public.site_settings for all to authenticated using(true) with check(true);
  end if;
end $$;
