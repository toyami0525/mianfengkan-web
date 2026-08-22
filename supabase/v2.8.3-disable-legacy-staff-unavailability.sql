-- 眠楓館 v2.8.3：停用舊「請假／不可指名時段」系統
-- 休假統一由 staff_work_calendar 排班月曆管理。

-- 清除歷史的部分時段請假，避免舊 create_reservation RPC 仍把它們視為不可指名。
delete from public.staff_unavailability;

-- 後台已移除新增介面；同步禁止 authenticated 再直接新增／修改舊時段資料。
revoke insert, update, delete on table public.staff_unavailability from authenticated;

-- 保留資料表與 SELECT 權限，避免舊版 RPC / schema 相依被破壞。
