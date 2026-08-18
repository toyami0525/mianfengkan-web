-- 眠楓館 v2.5.3：後台點餐即時通知
-- 請在 Supabase SQL Editor 執行一次。
-- 讓 public.orders 的 INSERT 事件可以透過 Supabase Realtime 即時送到後台。

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;
