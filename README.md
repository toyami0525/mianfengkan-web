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
