#!/usr/bin/env node
/**
 * Marketing_Map_Auto_list — 行銷地圖名單自動化
 * 用法：node search.js "板橋 牙醫診所" [--max 60]
 * 輸出：output/<關鍵字>_<日期>.csv（UTF-8 BOM，Excel 可直接開啟）
 */
const fs = require("fs");
const path = require("path");

// ---- 讀取 .env ----
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+)\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}
const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
if (!API_KEY) {
  console.error("錯誤：找不到 GOOGLE_MAPS_API_KEY。請複製 .env.example 為 .env 並填入你的 API Key。");
  process.exit(1);
}

// ---- 解析參數 ----
const args = process.argv.slice(2);
const maxIdx = args.indexOf("--max");
const maxResults = maxIdx >= 0 ? Math.min(parseInt(args[maxIdx + 1], 10) || 60, 60) : 60;
const query = args.filter((_, i) => maxIdx < 0 || (i !== maxIdx && i !== maxIdx + 1))[0];
if (!query) {
  console.error('用法：node search.js "板橋 牙醫診所" [--max 60]');
  process.exit(1);
}

const FIELD_MASK = [
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
  "nextPageToken",
].join(",");

async function searchPage(pageToken) {
  const body = { textQuery: query, languageCode: "zh-TW", pageSize: 20 };
  if (pageToken) body.pageToken = pageToken;
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": API_KEY,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API 回傳 ${res.status}：${text}`);
  }
  return res.json();
}

function csvEscape(v) {
  const s = String(v == null ? "" : v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

(async () => {
  console.log(`搜尋中：「${query}」（最多 ${maxResults} 筆）…`);
  const places = [];
  let pageToken = null;
  do {
    const data = await searchPage(pageToken);
    places.push(...(data.places || []));
    pageToken = data.nextPageToken || null;
  } while (pageToken && places.length < maxResults);

  const rows = places.slice(0, maxResults).map((p) => [
    p.displayName?.text || "",
    p.nationalPhoneNumber || "",
    p.formattedAddress || "",
    p.websiteUri || "",
    p.rating ?? "",
    p.userRatingCount ?? "",
    p.googleMapsUri || "",
  ]);

  if (rows.length === 0) {
    console.log("查無結果，請換個關鍵字試試（例如加上區域名稱）。");
    return;
  }

  const header = ["店名", "電話", "地址", "網站", "評分", "評論數", "Google Maps 連結"];
  const csv = "﻿" + [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n");

  const outDir = path.join(__dirname, "output");
  fs.mkdirSync(outDir, { recursive: true });
  const safeName = query.replace(/[\\/:*?"<>|\s]+/g, "_");
  const date = new Date().toISOString().slice(0, 10);
  const outFile = path.join(outDir, `${safeName}_${date}.csv`);
  fs.writeFileSync(outFile, csv);

  const withPhone = rows.filter((r) => r[1]).length;
  console.log(`完成！共 ${rows.length} 筆（其中 ${withPhone} 筆有電話）`);
  console.log(`檔案：${outFile}`);
})().catch((err) => {
  console.error("執行失敗：", err.message);
  process.exit(1);
});
