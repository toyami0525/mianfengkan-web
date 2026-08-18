-- 眠楓館 v2.1.5：開放羽鶴璃久指名，並啟用 reservations 即時通知

update public.staff
set active = true,
    accepting_reservations = true,
    updated_at = now()
where slug = 'riku' or name = '羽鶴璃久';

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'reservations'
  ) then
    alter publication supabase_realtime add table public.reservations;
  end if;
end $$;
