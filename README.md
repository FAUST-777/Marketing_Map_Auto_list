# 🗺️ Marketing_Map_Auto_list — 行銷地圖名單自動化

**by Willie Lin**

輸入「區域 + 行業」關鍵字，自動透過 Google Places API 拉出店家名單（名稱、地址、電話、網站、評分），輸出成 Excel 可直接開啟的 CSV 檔，取代業務手動翻 Google Maps 抄資料。

---

## 需求起因

公司有一位 Marketing 業務，日常工作流程是：

1. 開 Google Maps 搜尋目標區域的店家
2. 一家一家點開，手動抄下店名、電話
3. 打電話聯絡，洽談協助廣告投放的合約

手動翻地圖抄資料非常沒有效率。因此想確認 Google Maps 是否有 API 可以直接拉出即時店家資料，讓業務把時間花在打電話談合約，而不是抄名單。

**答案：有。** Google Places API（New）的 Text Search 可以做到，本專案就是把它包成一行指令。

## 快速開始

### 1. 申請 Google API Key（一次性）

1. 到 [Google Cloud Console](https://console.cloud.google.com/) 建立專案
2. 啟用 **Places API (New)**
3. 建立 API Key（建議限制只能呼叫 Places API）
4. 複製 `.env.example` 為 `.env`，填入你的 Key：

```
GOOGLE_MAPS_API_KEY=你的KEY
```

### 2. 執行

```bash
node search.js "板橋 牙醫診所"
node search.js "新莊 健身房" --max 60
```

執行完會在 `output/` 資料夾產生 CSV 檔（UTF-8 BOM，Excel 直接雙擊開啟中文不會亂碼），欄位包含：

| 欄位 | 說明 |
|------|------|
| 縣市 | 例如：新北市（可用 Excel 篩選分類） |
| 行政區 | 例如：板橋區 |
| 店名 | 店家名稱 |
| 電話 | 市話/手機（沒有登記則空白） |
| 地址 | 完整地址 |
| 網站 | 官網或 FB/IG 連結 |
| 評分 | Google 星等 |
| 評論數 | 評論總數 |
| Google Maps 連結 | 點開即可看店家頁面 |

名單會先依「縣市 → 行政區」排序，同區店家排在一起，方便業務按地理區域分批開發。

## 費用說明

- Google Maps Platform 每月有免費額度（各 SKU 免費呼叫次數上限）
- 本工具因為要拉「電話、網站」，屬於較高計價的 Contact Data 層級
- 以業務開發名單的用量（每月數千筆以內）通常在免費額度內，不會產生費用
- Text Search 每次搜尋最多回傳 60 筆（分 3 頁，程式已自動翻頁）

## 注意事項

- Google 條款規定 API 拉出的資料**快取不得超過 30 天**，本工具定位為「產生當期開發名單」，不建議拿來建永久資料庫
- API Key 放在 `.env`，已加入 `.gitignore`，不會被 commit 上 GitHub

## 技術說明

- Node.js 18+（使用內建 `fetch`，**零相依套件，不需 npm install**）
- Google Places API (New) — `places:searchText` endpoint
- 使用 FieldMask 只要求需要的欄位，控制計費層級
- CSV 輸出加 UTF-8 BOM，確保 Excel 開啟中文正常

## 開發記錄

詳見 [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md)（含需求討論的對話過程記錄）
