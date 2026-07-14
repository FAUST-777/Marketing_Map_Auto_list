#!/usr/bin/env node
/**
 * 批次搜尋：多個地區 × 多個關鍵字，合併去重成一份名單
 * 用法：node batch.js --areas "板橋,中和" --keywords "餐廳,小吃,甜點店,咖啡廳" [--name 名單名稱] [--sheet]
 * 也可用內建的食物關鍵字組：node batch.js --areas "板橋,中和" --preset food --sheet
 * --prefix 台中：區名是通用名稱（東區、北區…）時必加，查詢會變成「台中東區 餐廳」，
 *               且過濾會要求縣市/地址包含前綴，避免抓到台南東區、新竹北區等外縣市同名區
 */
const { searchPlaces, placeToRow, sortRows, writeCsv, HEADER } = require("./lib");

const PRESETS = {
  food: ["餐廳", "小吃", "甜點店", "咖啡廳", "早午餐", "火鍋店", "燒烤", "日式料理", "飲料店", "麵包店", "義式餐廳", "牛排館"],
};

const args = process.argv.slice(2);
function getOpt(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
}
const areas = (getOpt("areas") || "").split(/[,，]/).map((s) => s.trim()).filter(Boolean);
const prefix = getOpt("prefix"); // 縣市前綴，例：台中
const preset = getOpt("preset");
const keywords = preset
  ? PRESETS[preset]
  : (getOpt("keywords") || "").split(/[,，]/).map((s) => s.trim()).filter(Boolean);
const listName = getOpt("name") || `${areas.join("")} ${preset || "批次"}`;
const toSheet = args.includes("--sheet");

if (areas.length === 0 || !keywords || keywords.length === 0) {
  console.error('用法：node batch.js --areas "板橋,中和" --keywords "餐廳,甜點店" [--name 名單名稱] [--sheet]');
  console.error(`  --preset food：內建食物關鍵字組（${PRESETS.food.join("、")}）`);
  process.exit(1);
}

(async () => {
  const queries = [];
  for (const area of areas) for (const kw of keywords) queries.push(`${prefix ? prefix + area : area} ${kw}`);
  console.log(`批次搜尋 ${queries.length} 組關鍵字（${areas.join("、")} × ${keywords.join("、")}）…`);

  const seen = new Map(); // googleMapsUri（去掉追蹤參數）→ row
  let fetched = 0;
  for (const q of queries) {
    try {
      const places = await searchPlaces(q, 60);
      fetched += places.length;
      for (const p of places) {
        const key = (p.googleMapsUri || "").split("&")[0] || `${p.displayName?.text}|${p.formattedAddress}`;
        if (!seen.has(key)) seen.set(key, placeToRow(p));
      }
      console.log(`  「${q}」${places.length} 筆（累計不重複 ${seen.size} 筆）`);
    } catch (err) {
      console.error(`  「${q}」失敗：${err.message}`);
    }
  }

  // 只保留搜尋地區內的店家（Google 有時會回傳鄰近地區的結果）
  // 台/臺互通：Google 官方地址寫「臺北市」，搜尋關鍵字慣用「台北」，兩種寫法都要能對上
  const areaRe = new RegExp(
    areas.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[台臺]/g, "[台臺]")).join("|")
  );
  // 優先比對縣市/行政區欄位，避免撞到外縣市的同名路名（例：搜「員山」誤收中和區員山路）；
  // 行政區解析不出來時才退回比對完整地址
  // 有 --prefix 時再加一道縣市檢查，擋掉外縣市的同名行政區（例：台南東區、新竹北區）
  const cityRe = prefix ? new RegExp(prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[台臺]/g, "[台臺]")) : null;
  const rows = sortRows(
    [...seen.values()].filter((r) => {
      if (cityRe && !(cityRe.test(r[0]) || cityRe.test(r[6]))) return false;
      return r[1] ? areaRe.test(r[0]) || areaRe.test(r[1]) : areaRe.test(r[6]);
    })
  );

  if (rows.length === 0) {
    console.log("查無結果。");
    return;
  }

  const outFile = writeCsv(listName, rows);
  const withPhone = rows.filter((r) => r[5]).length;
  console.log(`\n完成！抓取 ${fetched} 筆 → 去重 ${seen.size} 筆 → 地區過濾後 ${rows.length} 筆（其中 ${withPhone} 筆有電話）`);
  console.log(`檔案：${outFile}`);

  if (toSheet) {
    const sheetId = process.env.GOOGLE_SHEET_ID;
    if (!sheetId) {
      console.error("錯誤：--sheet 需要在 .env 設定 GOOGLE_SHEET_ID。");
      process.exit(1);
    }
    const { writeToSheet } = require("./sheets");
    const date = new Date().toISOString().slice(0, 10);
    const tabName = `${listName} ${date}`.slice(0, 90);
    console.log(`寫入 Google Sheet 分頁「${tabName}」…`);
    const url = await writeToSheet(sheetId, tabName, [HEADER, ...rows]);
    console.log(`已寫入：${url}`);
  }
})().catch((err) => {
  console.error("執行失敗：", err.message);
  process.exit(1);
});
