# 眠楓館 v2.1.5 測試版

- 羽鶴璃久加入前台指名館員名單。
- 管理後台新增 Supabase Realtime 新指名通知。
- 新指名成立時跳出視窗並播放雙音提示音。
- 瀏覽器限制自動播放，因此後台首次使用請按「開啟指名提示音」。
- 同步套用 combined-order route.ts 的 TypeScript 型別修正。

## Supabase Realtime
若後台沒有即時收到通知，請在 Supabase Dashboard 的 Database > Replication 中確認 reservations 表已加入 supabase_realtime publication。
