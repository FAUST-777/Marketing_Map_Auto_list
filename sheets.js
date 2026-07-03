/**
 * Google Sheets 寫入模組（零相依：用 Node 內建 crypto 簽 JWT）
 * 需要：service-account.json（服務帳戶金鑰）+ Sheet 已分享給服務帳戶 email（編輯者）
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function loadServiceAccount() {
  const p = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || path.join(__dirname, "service-account.json");
  if (!fs.existsSync(p)) {
    throw new Error(
      `找不到服務帳戶金鑰檔：${p}\n` +
        "請到 Google Cloud Console → IAM 與管理 → 服務帳戶 → 建立金鑰（JSON），" +
        "存成專案資料夾內的 service-account.json，並把 Google Sheet 分享給服務帳戶的 email（編輯者權限）。"
    );
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: sa.token_uri,
      iat: now,
      exp: now + 3600,
    })
  );
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = b64url(signer.sign(sa.private_key));
  const jwt = `${header}.${claims}.${signature}`;

  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`取得 access token 失敗（${res.status}）：${await res.text()}`);
  return (await res.json()).access_token;
}

async function sheetsApi(token, method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Sheets API ${method} ${url} 失敗（${res.status}）：${await res.text()}`);
  return res.json();
}

/**
 * 把 rows（含表頭）寫入指定 Sheet 的分頁（分頁不存在就建立，存在則清空重寫）
 */
async function writeToSheet(spreadsheetId, tabName, rows) {
  const sa = loadServiceAccount();
  const token = await getAccessToken(sa);
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;

  const meta = await sheetsApi(token, "GET", `${base}?fields=sheets.properties`);
  const exists = (meta.sheets || []).some((s) => s.properties.title === tabName);
  if (!exists) {
    await sheetsApi(token, "POST", `${base}:batchUpdate`, {
      requests: [{ addSheet: { properties: { title: tabName } } }],
    });
  } else {
    await sheetsApi(token, "POST", `${base}/values/${encodeURIComponent(tabName)}:clear`, {});
  }

  await sheetsApi(
    token,
    "PUT",
    `${base}/values/${encodeURIComponent(tabName)}!A1?valueInputOption=RAW`,
    { values: rows }
  );
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}

module.exports = { writeToSheet };
