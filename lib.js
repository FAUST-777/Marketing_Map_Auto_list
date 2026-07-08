/**
 * 共用邏輯：Places 搜尋、地區/類型解析、CSV 輸出
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

async function searchPage(query, pageToken) {
  const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
  if (!API_KEY) throw new Error("找不到 GOOGLE_MAPS_API_KEY。請複製 .env.example 為 .env 並填入你的 API Key。");
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
  if (!res.ok) throw new Error(`API 回傳 ${res.status}：${await res.text()}`);
  return res.json();
}

/** 搜尋一個關鍵字，自動翻頁，最多 max 筆（上限 60） */
async function searchPlaces(query, max = 60) {
  const places = [];
  let pageToken = null;
  do {
    const data = await searchPage(query, pageToken);
    places.push(...(data.places || []));
    pageToken = data.nextPageToken || null;
  } while (pageToken && places.length < max);
  return places.slice(0, max);
}

// Google 部分店家的地址元件是簡體字，轉回繁體（台灣地名常見字）
const S2T = { 区: "區", 乡: "鄉", 镇: "鎮", 县: "縣", 桥: "橋", 庄: "莊", 芦: "蘆", 坜: "壢", 岛: "島", 湾: "灣", 凤: "鳳", 冈: "岡", 莺: "鶯", 树: "樹", 峡: "峽", 双: "雙", 沥: "瀝", 龙: "龍", 潭: "潭", 芗: "薌", 头: "頭", 屿: "嶼", 义: "義", 万: "萬", 丰: "豐", 荣: "榮", 兰: "蘭", 竹: "竹", 苓: "苓", 盐: "鹽", 埕: "埕", 内: "內", 门: "門", 关: "關", 鸟: "鳥", 松: "松", 园: "園", 里: "里", 云: "雲", 嘉: "嘉", 高: "高", 屏: "屏", 澎: "澎", 臺: "台" };
function toTraditional(s) {
  return s.replace(/./g, (ch) => S2T[ch] || ch);
}

// 從 addressComponents 拆出縣市與行政區；拆不到時退回用地址字串解析
function extractRegion(place) {
  let city = "";
  let district = "";
  for (const c of place.addressComponents || []) {
    const types = c.types || [];
    const name = toTraditional(c.longText || "");
    if (types.includes("administrative_area_level_1")) city = name;
    if (types.includes("administrative_area_level_2") || types.includes("locality")) {
      if (/[鄉鎮市區]$/.test(name) && name !== city) district = name;
    }
  }
  if (!city || !district) {
    const addr = toTraditional(place.formattedAddress || "");
    const m = addr.match(/([^\s,0-9]{1,3}[縣市])([^\s,0-9]{1,3}[鄉鎮市區])/);
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

const HEADER = ["縣市", "行政區", "商業大類", "商業類型", "店名", "電話", "地址", "網站", "評分", "評論數", "Google Maps 連結"];

function placeToRow(p) {
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
}

/** 依 縣市 → 行政區 → 商業類型 排序（就地） */
function sortRows(rows) {
  rows.sort(
    (a, b) =>
      a[0].localeCompare(b[0], "zh-TW") ||
      a[1].localeCompare(b[1], "zh-TW") ||
      String(a[3]).localeCompare(String(b[3]), "zh-TW")
  );
  return rows;
}

function csvEscape(v) {
  const s = String(v == null ? "" : v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 寫出 UTF-8 BOM CSV，回傳檔案路徑 */
function writeCsv(name, rows) {
  const csv = "﻿" + [HEADER, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n");
  const outDir = path.join(__dirname, "output");
  fs.mkdirSync(outDir, { recursive: true });
  const safeName = name.replace(/[\\/:*?"<>|\s]+/g, "_");
  const date = new Date().toISOString().slice(0, 10);
  const outFile = path.join(outDir, `${safeName}_${date}.csv`);
  fs.writeFileSync(outFile, csv);
  return outFile;
}

module.exports = { searchPlaces, placeToRow, sortRows, writeCsv, HEADER };
