-- 眠楓館 v1.7：館員名單整理
-- 保留羽鶴璃久與微；其餘館員不顯示，也不可再被新指名。
update public.staff
set active = false,
    accepting_reservations = false
where slug not in ('riku', 'wei');

update public.staff
set active = true
where slug in ('riku', 'wei');
