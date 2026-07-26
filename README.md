# 眠楓館正式版 v1（v12 外觀保留版）

此專案保留 v12 前台外觀、圖片、文案與頁面，並新增 Next.js + Supabase 正式管理後台。

## 上線
1. 建立空白 GitHub repository，將本資料夾內全部檔案上傳。
2. 建立 Supabase project，在 SQL Editor 執行 `supabase/schema.sql`。
3. Authentication → Users 建立管理員帳號。
4. Vercel 匯入 repository，設定：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
5. Deploy。

## 路徑
- 前台 `/`（會導向 v12 首頁）
- 後台 `/admin`
- 登入 `/login`

## 說明
前台 v12 目前完整保留，後台已改為 Supabase。預約與點餐前台的資料庫串接可在後續版本逐頁替換，不影響外觀。

## v1.1 點餐／預約串接修正

1. 在 Supabase SQL Editor 執行 `supabase/booking-orders-fix.sql`。
2. 將本專案完整覆蓋到 GitHub 並推送。
3. Vercel 完成重新部署後，前台點餐與預約會寫入 Supabase，後台可直接查看。


## v1.2 後台操作修正
部署前請在 Supabase SQL Editor 執行 `supabase/admin-actions-fix.sql`。此修正加入後台狀態更新權限、錯誤提示、訂單品項易讀格式與台灣時間顯示。


## v1.3 後台紀錄管理

- 預約與點餐預設顯示「今天／待確認」。
- 可切換今天、昨天、本週、本月與全部。
- 可切換狀態並搜尋客人、館員、服務或餐點。
- 每頁 20 筆，超過會自動分頁。
- 完成與取消只改變狀態，不會刪除資料。
- Dashboard 改為今日統計。
