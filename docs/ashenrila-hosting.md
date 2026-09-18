# 艾申瑞拉網站

正式入口為 https://mianfengkan-web.vercel.app/ashenrila 。

艾申瑞拉的五個靜態頁面、樣式、互動及全部圖片位於 `public/ashenrila/`，隨本專案的 Vercel 部署一起發布。`next.config.ts` 將五個無副檔名網址對應至各自的 `index.html`。頁面導覽與圖片使用 `/ashenrila/` 前綴，避免與眠楓館同名頁面混淆。

眠楓館副館主介紹的入口位於 `public/assets/staff-directory.js`，指向 `/ashenrila`，並保留玻璃鞋圖片及另開視窗的行為。

內容由既有艾申瑞拉網站完整遷入，保留午夜酒單的「圖片僅供參考。」及員工照片切換。後續艾申瑞拉內容請更新本目錄；舊 Sites 網址不再用於公開入口。
