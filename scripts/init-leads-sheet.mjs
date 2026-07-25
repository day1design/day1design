#!/usr/bin/env node
// ─── 리드 미러링 구글시트 헤더 초기화 (1회) ───
// 워커는 append 만 한다(핫패스 서브리퀘스트 최소화). 헤더 1행은 이 스크립트로 한 번 넣는다.
//
// 실행: node scripts/init-leads-sheet.mjs           (헤더 확인/생성)
//       node scripts/init-leads-sheet.mjs --test    (헤더 + 테스트 행 1건 append)
//
// 인증값은 site/.env.local 에서 읽는다(커밋 금지 파일). 필요 키:
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_SHEETS_REFRESH_TOKEN
//   LEADS_SHEET_ID (없으면 아래 기본값)
// 시트 쓰기에는 https://www.googleapis.com/auth/spreadsheets 스코프가 필요하다.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  LEAD_SHEET_HEADER,
  LEGACY_COLUMN_COUNT,
} from "../worker/src/lib/sheets.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SHEET_ID = "1V2xNjQZPJUskHoARMRLnyVdXGFcFsdM6-H7ihDNEMcA";

async function loadEnvFile(path) {
  try {
    const text = await readFile(path, "utf8");
    const out = {};
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

async function accessToken({ clientId, clientSecret, refreshToken }) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new Error(
      `토큰 발급 실패 ${res.status} ${body?.error || ""} ${body?.error_description || ""}`,
    );
  }
  if (body.scope && !body.scope.includes("spreadsheets")) {
    throw new Error(
      `스코프 부족 — 현재: ${body.scope}\n` +
        "OAuth Playground 에서 https://www.googleapis.com/auth/spreadsheets 를 선택해 재발급하세요.",
    );
  }
  return body.access_token;
}

async function api(token, path, init = {}) {
  const res = await fetch(`https://sheets.googleapis.com/v4/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

async function main() {
  const env = {
    ...(await loadEnvFile(resolve(ROOT, "site/.env.local"))),
    ...(await loadEnvFile(resolve(ROOT, ".env.local"))),
    ...process.env,
  };
  const sheetId = env.LEADS_SHEET_ID || DEFAULT_SHEET_ID;
  const token = await accessToken({
    clientId: env.GOOGLE_SHEETS_CLIENT_ID || env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_SHEETS_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET,
    refreshToken: env.GOOGLE_SHEETS_REFRESH_TOKEN || env.GOOGLE_REFRESH_TOKEN,
  });

  const meta = await api(
    token,
    `spreadsheets/${sheetId}?fields=properties.title,sheets.properties`,
  );
  const sheet =
    (env.LEADS_SHEET_TAB &&
      meta.sheets?.find(
        (s) => s.properties.title === env.LEADS_SHEET_TAB,
      )) ||
    meta.sheets?.[0];
  const tab = sheet?.properties?.title;
  const lastCol = String.fromCharCode(64 + LEAD_SHEET_HEADER.length);
  console.log(`문서: ${meta.properties?.title} / 탭: ${tab}`);

  const range = `${tab}!A1:${lastCol}1`;
  const current = await api(
    token,
    `spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`,
  );
  const row1 = current.values?.[0] || [];
  const legacy = LEAD_SHEET_HEADER.slice(0, LEGACY_COLUMN_COUNT);

  // 기존 5천여 행이 쌓인 A~L 은 절대 건드리지 않는다. 비어있을 때만 새로 쓰고,
  // 기존 12컬럼과 일치하면 뒤에 M~O 만 덧붙인다. 그 외에는 아무것도 하지 않는다.
  const matchesLegacy = row1.slice(0, LEGACY_COLUMN_COUNT).join("|") === legacy.join("|");
  if (row1.length !== 0 && !matchesLegacy) {
    console.log(
      `⚠ 1행이 기존 컬럼과 달라 아무것도 변경하지 않았습니다.\n  현재: ${row1.join(" | ")}\n  기대(A~L): ${legacy.join(" | ")}`,
    );
    return;
  }
  if (row1.length === LEAD_SHEET_HEADER.length) {
    console.log("헤더 이미 최신 — 변경 없음");
  } else {
    // 그리드가 12칸이면 M~O 를 쓸 수 없다 → 열 먼저 확장
    const cols = sheet?.properties?.gridProperties?.columnCount || 0;
    if (cols < LEAD_SHEET_HEADER.length) {
      await api(token, `spreadsheets/${sheetId}:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({
          requests: [
            {
              appendDimension: {
                sheetId: sheet.properties.sheetId,
                dimension: "COLUMNS",
                length: LEAD_SHEET_HEADER.length - cols,
              },
            },
          ],
        }),
      });
      console.log(`열 확장: ${cols} → ${LEAD_SHEET_HEADER.length}`);
    }
    await api(
      token,
      `spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
      { method: "PUT", body: JSON.stringify({ values: [LEAD_SHEET_HEADER] }) },
    );
    console.log(
      row1.length === 0
        ? `헤더 생성: ${LEAD_SHEET_HEADER.join(" | ")}`
        : `기존 A~L 유지 + 추가: ${LEAD_SHEET_HEADER.slice(LEGACY_COLUMN_COUNT).join(" | ")}`,
    );
  }

  if (process.argv.includes("--test")) {
    const sample = LEAD_SHEET_HEADER.map(() => "");
    sample[0] = new Date().toISOString(); // 접수시간
    sample[4] = "연동테스트"; // 이름
    sample[5] = "010-0000-0000"; // 연락처
    sample[10] = "구글시트 연동 확인용 — 지워도 됩니다"; // 상담내용
    sample[12] = "test"; // 출처
    await api(
      token,
      `spreadsheets/${sheetId}/values/${encodeURIComponent(`${tab}!A:${lastCol}`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: "POST", body: JSON.stringify({ values: [sample] }) },
    );
    console.log("테스트 행 1건 append 완료 — 확인 후 시트에서 지우세요.");
  }
}

main().catch((error) => {
  console.error(`[init-leads-sheet] ${error.message}`);
  process.exitCode = 1;
});
