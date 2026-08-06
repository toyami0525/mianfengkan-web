# 眠楓館 v2.2.0｜格林館員後台測試版

## 本版目的
先以格林單一帳號完成館員登入、個人資料可見度及即時指名提示音測試。

## 功能
- 館員登入頁：`/login`
- 登入角色 ID：`格林`
- 登入成功後前往：`/admin`
- 格林只可查看自己的指名、點餐與個人資料
- 客人送出格林的新指名後，格林後台跳出通知並播放雙音提示
- 館員可切換接單中／休息中
- 提示音需先在後台按一次「開啟指名提示音」

## Supabase
請確認：
1. Authentication 已建立 `gelin@mianfengkan.local`
2. `staff_accounts` 已將該 user_id 綁定至格林的 staff_id
3. role 為 `staff`、active 為 `true`
4. 已執行 `supabase/v2.1.6-staff-accounts-permissions.sql`

## 測試方式
1. 開啟 `/login`，使用「格林」與密碼登入。
2. 在後台按「開啟指名提示音」。
3. 另一個瀏覽器或無痕視窗送出格林指名。
4. 後台應跳出新指名視窗並播放提示音。
