# Marketing_Map_Auto_list — 開發日誌與對話過程記錄

**作者：Willie Lin**

---

## 第 1 輪開發（2026-07-03）｜需求討論 & 專案初建

### 對話過程記錄

**需求提出：**

> 我現在有一個新的專案要處理，請幫我新增到 GitHub 上去。老樣子，要有需求起因跟對話過程記錄。專案名稱叫做 Marketing_Map_Auto_list。

**儲存方式討論：**

> 專案資料想放 GitHub 雲端，本機端應該沒有一定要儲存對吧？

結論：GitHub 即為完整雲端儲存，本機只是工作時的暫存副本。push 上去後本機可刪除，之後要修改再 `git clone` 下來即可。因此本專案不在本機保留正式副本。

**詳細需求說明：**

> 我有一個 Marketing 業務，她都從 Google Map 去找店家資料，再打電話去聯絡，談協助廣告投放的合約。我希望她做得更有效率，所以想確認 Google Map 是不是有 API 可以拉出即時店家資料，就不用翻地圖？

### 需求分析結論

1. **Google Maps 有官方 API** — Places API (New) 的 Text Search，輸入「區域 + 行業」即可回傳店家的名稱、地址、電話、網站、評分、評論數
2. **費用** — 每月有免費額度；電話/網站屬於較高計價的 Contact Data 層級，但業務名單用量（月數千筆內）通常免費額度就夠
3. **合規** — Google 條款規定資料快取不得超過 30 天，本工具定位為「產生當期開發名單」而非永久資料庫，符合條款
4. **產出形式** — CSV（UTF-8 BOM），業務用 Excel 雙擊開啟即可照著名單打電話

### 完成項目

- `search.js` — 主程式：Text Search + 自動翻頁（最多 60 筆）+ CSV 輸出
- `.env.example` — API Key 設定範本（真正的 `.env` 已加入 `.gitignore`）
- `README.md` — 需求起因、API Key 申請步驟、使用方式、費用說明
- 建立 GitHub 公開 repo 並 push

### 技術決策

| 決策 | 原因 |
|------|------|
| Node.js 內建 fetch、零相依套件 | 業務電腦只要裝 Node.js 18+ 就能跑，不用 npm install |
| Places API (New) 而非舊版 | 舊版 Places API 已停止對新專案開放，新版用 FieldMask 精準控制計費 |
| CSV 加 UTF-8 BOM | Excel 直接開啟中文才不會亂碼 |
| API Key 走 `.env` | repo 是公開的，金鑰絕不能 commit |
