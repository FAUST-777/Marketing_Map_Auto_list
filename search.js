#!/usr/bin/env node
/**
 * Marketing_Map_Auto_list — 行銷地圖名單自動化（單一關鍵字）
 * 用法：node search.js "板橋 牙醫診所" [--max 60] [--sheet]
 * 輸出：output/<關鍵字>_<日期>.csv（UTF-8 BOM，Excel 可直接開啟）
 */
const { searchPlaces, placeToRow, sortRows, writeCsv, HEADER } = require("./lib");

const args = process.argv.slice(2);
const maxIdx = args.indexOf("--max");
const maxResults = maxIdx >= 0 ? Math.min(parseInt(args[maxIdx + 1], 10) || 60, 60) : 60;
const toSheet = args.includes("--sheet");
const query = args.filter(
  (a, i) => a !== "--sheet" && (maxIdx < 0 || (i !== maxIdx && i !== maxIdx + 1))
)[0];
if (!query) {
  console.error('用法：node search.js "板橋 牙醫診所" [--max 60] [--sheet]');
  console.error("  --sheet：同時把結果寫入 .env 設定的 Google Sheet（分頁名 = 搜尋關鍵字）");
  process.exit(1);
}

(async () => {
  console.log(`搜尋中：「${query}」（最多 ${maxResults} 筆）…`);
  const places = await searchPlaces(query, maxResults);
  const rows = sortRows(places.map(placeToRow));

  if (rows.length === 0) {
    console.log("查無結果，請換個關鍵字試試（例如加上區域名稱）。");
    return;
  }

  const outFile = writeCsv(query, rows);
  const withPhone = rows.filter((r) => r[5]).length;
  console.log(`完成！共 ${rows.length} 筆（其中 ${withPhone} 筆有電話）`);
  console.log(`檔案：${outFile}`);

  if (toSheet) {
    const sheetId = process.env.GOOGLE_SHEET_ID;
    if (!sheetId) {
      console.error("錯誤：--sheet 需要在 .env 設定 GOOGLE_SHEET_ID（Sheet 網址中 /d/ 後面那串）。");
      process.exit(1);
    }
    const { writeToSheet } = require("./sheets");
    const date = new Date().toISOString().slice(0, 10);
    const tabName = `${query} ${date}`.slice(0, 90);
    console.log(`寫入 Google Sheet 分頁「${tabName}」…`);
    const url = await writeToSheet(sheetId, tabName, [HEADER, ...rows]);
    console.log(`已寫入：${url}`);
  }
})().catch((err) => {
  console.error("執行失敗：", err.message);
  process.exit(1);
});
