-- 眠楓館 v1.8：羽鶴璃久保留於館員介紹，但不開放指名
-- 不刪除館員，也不影響既有預約紀錄。

update public.staff
set active = true,
    accepting_reservations = false,
    updated_at = now()
where slug = 'riku';

update public.staff
set active = true,
    accepting_reservations = true,
    updated_at = now()
where slug = 'wei';
