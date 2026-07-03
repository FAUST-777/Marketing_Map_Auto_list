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
  "places.addressComponents",
  "places.primaryType",
  "places.primaryTypeDisplayName",
  "places.types",
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

// 從 addressComponents 拆出縣市與行政區；拆不到時退回用地址字串解析
function extractRegion(place) {
  let city = "";
  let district = "";
  for (const c of place.addressComponents || []) {
    const types = c.types || [];
    const name = c.longText || "";
    if (types.includes("administrative_area_level_1")) city = name;
    if (types.includes("administrative_area_level_2") || types.includes("locality")) {
      if (/[鄉鎮市區]$/.test(name) && name !== city) district = name;
    }
  }
  if (!city || !district) {
    const m = (place.formattedAddress || "").match(/([^\s,0-9]{1,3}[縣市])([^\s,0-9]{1,3}[鄉鎮市區])/);
    if (m) {
      if (!city) city = m[1];
      if (!district) district = m[2];
    }
  }
  return { city, district };
}

// Google primaryType（英文代碼）→ 商業大類（中文）
const CATEGORY_RULES = [
  [/restaurant|cafe|coffee|bakery|bar$|food|meal|dessert|ice_cream|tea_house|breakfast|brunch|pizza|hamburger|noodle|ramen|sushi|hot_pot|barbecue|buffet|steak|seafood|vegetarian|juice|catering|deli|confectionery|donut|bagel|sandwich|wine_bar|pub/, "餐飲"],
  [/hospital|dental|dentist|doctor|clinic|pharmacy|drugstore|physiotherap|medical|health|veterinar|chiropract|wellness/, "醫療保健"],
  [/beauty|hair|spa$|nail|barber|massage|skin_care|tanning|makeup/, "美容美體"],
  [/gym|fitness|yoga|sports|swimming|golf|martial_arts|dance|bowling|climbing/, "運動健身"],
  [/school|university|academy|education|tutor|preschool|kindergarten|library/, "教育"],
  [/hotel|lodging|motel|hostel|resort|bed_and_breakfast|guest_house|campground/, "住宿"],
  [/car_|auto_|motorcycle|gas_station|parking|electric_vehicle/, "汽機車"],
  [/bank|atm|finance|insurance|accounting|money_transfer/, "金融"],
  [/real_estate/, "不動產"],
  [/lawyer|legal|notary/, "法律"],
  [/store$|shop$|market|mall|shopping|boutique|florist|jewelr|pet_|hardware|furniture|electronics|grocery|supermarket|convenience|liquor|book|gift/, "零售"],
  [/travel|tour|amusement|aquarium|zoo|museum|movie|night_club|karaoke|park$|casino|event_venue/, "旅遊娛樂"],
  [/church|temple|mosque|synagogue|place_of_worship/, "宗教"],
];

function classify(place) {
  const key = place.primaryType || (place.types || [])[0] || "";
  for (const [re, label] of CATEGORY_RULES) {
    if (re.test(key)) return label;
  }
  return key ? "其他" : "";
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

  const rows = places.slice(0, maxResults).map((p) => {
    const { city, district } = extractRegion(p);
    return [
      city,
      district,
      classify(p),
      p.primaryTypeDisplayName?.text || "",
      p.displayName?.text || "",
      p.nationalPhoneNumber || "",
      p.formattedAddress || "",
      p.websiteUri || "",
      p.rating ?? "",
      p.userRatingCount ?? "",
      p.googleMapsUri || "",
    ];
  });
  // 依 縣市 → 行政區 排序，同區店家排在一起
  rows.sort((a, b) => a[0].localeCompare(b[0], "zh-TW") || a[1].localeCompare(b[1], "zh-TW"));

  if (rows.length === 0) {
    console.log("查無結果，請換個關鍵字試試（例如加上區域名稱）。");
    return;
  }

  const header = ["縣市", "行政區", "商業大類", "商業類型", "店名", "電話", "地址", "網站", "評分", "評論數", "Google Maps 連結"];
  const csv = "﻿" + [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n");

  const outDir = path.join(__dirname, "output");
  fs.mkdirSync(outDir, { recursive: true });
  const safeName = query.replace(/[\\/:*?"<>|\s]+/g, "_");
  const date = new Date().toISOString().slice(0, 10);
  const outFile = path.join(outDir, `${safeName}_${date}.csv`);
  fs.writeFileSync(outFile, csv);

  const withPhone = rows.filter((r) => r[5]).length;
  console.log(`完成！共 ${rows.length} 筆（其中 ${withPhone} 筆有電話）`);
  console.log(`檔案：${outFile}`);
})().catch((err) => {
  console.error("執行失敗：", err.message);
  process.exit(1);
});
