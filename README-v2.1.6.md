# 眠楓館 v2.1.6 — 館員個人後台測試版

## 新增
- 館員以「遊戲角色 ID＋密碼」登入，登入畫面不必輸入 Email。
- 館主可見全部後台功能與全部指名通知。
- 一般館員只可見自己的總覽、指名、點餐與通知。
- 只有被指名的館員會跳出視窗並播放提示音；館主仍會收到全部通知。
- 館員可在個人後台切換「接單中／休息中」。
- 資料庫 RLS 權限限制，不只是把前台選單隱藏。

## 更新步驟
1. 在 Supabase Authentication > Users 建立館主與館員帳號。
2. 將專案檔案更新至 GitHub，等待 Vercel 部署。
3. 在 Supabase SQL Editor 執行 `supabase/v2.1.6-staff-accounts-permissions.sql`。
4. 以角色 ID 登入 `/login`。
5. 每台裝置首次登入後，按一次「開啟指名提示音」。

## 測試帳號對照
- 羽鶴璃久 → rikyu@mianfengkan.local → owner
- 慕斯菲露 → musufiru@mianfengkan.local → staff

密碼由 Supabase Authentication 建立帳號時自行設定，程式與 SQL 不會保存密碼。
