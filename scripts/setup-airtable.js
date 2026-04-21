#!/usr/bin/env node
// Airtable Base + 4개 테이블 자동 생성 스크립트
//
// 사전 조건:
//   - Airtable 계정 + Personal Access Token (PAT) 발급
//   - PAT scopes: data.records:read, data.records:write, schema.bases:read, schema.bases:write
//   - worker/.dev.vars 에 AIRTABLE_TOKEN 입력
//
// 동작:
//   1. 토큰으로 workspace 목록 조회
//   2. "day1design" Base가 이미 있으면 ID 추출, 없으면 첫 workspace에 자동 생성
//   3. 4개 테이블(Estimates/HeroSlides/Portfolio/Community) 생성 (없는 것만)
//   4. worker/.dev.vars 와 site/.env.local 에 AIRTABLE_BASE_ID 자동 기록
//
// 사용법:
//   node scripts/setup-airtable.js
//   node scripts/setup-airtable.js --workspace=wspXXXX  # 특정 워크스페이스 지정
//   node scripts/setup-airtable.js --dry-run

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DEV_VARS = path.join(ROOT, "worker", ".dev.vars");
const ENV_LOCAL = path.join(ROOT, "site", ".env.local");

const DRY_RUN = process.argv.includes("--dry-run");
const WS_ARG = (
  process.argv.find((a) => a.startsWith("--workspace=")) || ""
).split("=")[1];

// --- .dev.vars 파서 ---
function readDotEnv(p) {
  if (!fs.existsSync(p)) return {};
  const raw = fs.readFileSync(p, "utf-8");
  const out = {};
  raw.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) return;
    let v = m[2];
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    out[m[1]] = v;
  });
  return out;
}

function writeDotEnv(p, obj, append = true) {
  let existing = "";
  if (append && fs.existsSync(p)) existing = fs.readFileSync(p, "utf-8");
  const keys = Object.keys(obj);
  const lines = existing.split(/\r?\n/);
  const seen = new Set();
  const out = lines.map((line) => {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=/);
    if (!m || !(m[1] in obj)) return line;
    seen.add(m[1]);
    return `${m[1]}=${obj[m[1]]}`;
  });
  keys.forEach((k) => {
    if (!seen.has(k)) out.push(`${k}=${obj[k]}`);
  });
  fs.writeFileSync(
    p,
    out.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n"),
  );
}

const env = readDotEnv(DEV_VARS);
const TOKEN = process.env.AIRTABLE_TOKEN || env.AIRTABLE_TOKEN;
if (!TOKEN) {
  console.error("❌ AIRTABLE_TOKEN 이 설정되지 않았습니다.");
  console.error(
    "   worker/.dev.vars 파일에 AIRTABLE_TOKEN=pat.xxx 입력 후 재실행하세요.",
  );
  console.error("   발급: https://airtable.com/create/tokens");
  console.error(
    "   scopes: data.records:read, data.records:write, schema.bases:read, schema.bases:write",
  );
  process.exit(1);
}

async function atFetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  }
  return data;
}

// --- 테이블 스키마 정의 ---
const TABLES = [
  {
    name: "Estimates",
    description: "상담신청 접수 + 관리",
    fields: [
      { name: "Name", type: "singleLineText" },
      { name: "Phone", type: "singleLineText" },
      { name: "Email", type: "email" },
      { name: "SpaceType", type: "singleLineText" },
      { name: "SpaceSize", type: "singleLineText" },
      { name: "Postcode", type: "singleLineText" },
      { name: "Address", type: "singleLineText" },
      { name: "AddressDetail", type: "singleLineText" },
      { name: "Schedule", type: "singleLineText" },
      { name: "Referral", type: "singleLineText" },
      { name: "Branch", type: "singleLineText" },
      { name: "Detail", type: "multilineText" },
      {
        name: "PrivacyAgreed",
        type: "checkbox",
        options: { icon: "check", color: "greenBright" },
      },
      { name: "ConceptFiles", type: "multilineText" },
      { name: "FloorPlans", type: "multilineText" },
      {
        name: "SubmittedAt",
        type: "dateTime",
        options: {
          timeZone: "Asia/Seoul",
          dateFormat: { name: "iso" },
          timeFormat: { name: "24hour" },
        },
      },
      { name: "IP", type: "singleLineText" },
      {
        name: "Status",
        type: "singleSelect",
        options: {
          choices: [
            { name: "접수대기", color: "yellowLight2" },
            { name: "상담중", color: "blueLight2" },
            { name: "견적완료", color: "tealLight2" },
            { name: "계약완료", color: "greenLight2" },
            { name: "취소", color: "grayLight2" },
          ],
        },
      },
      { name: "Assignee", type: "singleLineText" },
      {
        name: "ContactedAt",
        type: "dateTime",
        options: {
          timeZone: "Asia/Seoul",
          dateFormat: { name: "iso" },
          timeFormat: { name: "24hour" },
        },
      },
      { name: "Memo", type: "multilineText" },
      { name: "EstimateAmount", type: "number", options: { precision: 0 } },
    ],
  },
  {
    name: "HeroSlides",
    description: "메인 히어로 슬라이드",
    fields: [
      { name: "Image", type: "url" },
      { name: "Href", type: "singleLineText" },
      { name: "Alt", type: "singleLineText" },
      { name: "Order", type: "number", options: { precision: 0 } },
      {
        name: "Active",
        type: "checkbox",
        options: { icon: "check", color: "greenBright" },
      },
    ],
  },
  {
    name: "Portfolio",
    description: "시공 포트폴리오 프로젝트",
    fields: [
      { name: "Name", type: "singleLineText" },
      { name: "Folder", type: "singleLineText" },
      { name: "Count", type: "number", options: { precision: 0 } },
      {
        name: "Category",
        type: "singleSelect",
        options: {
          choices: [
            { name: "HOUSE", color: "tealLight2" },
            { name: "OFFICE", color: "purpleLight2" },
          ],
        },
      },
      { name: "Order", type: "number", options: { precision: 0 } },
      { name: "RightFolder", type: "singleLineText" },
      { name: "RightCount", type: "number", options: { precision: 0 } },
      { name: "RightName", type: "singleLineText" },
      { name: "ThumbAfter", type: "url" },
      { name: "ThumbBefore", type: "url" },
    ],
  },
  {
    name: "Community",
    description: "커뮤니티 게시글",
    fields: [
      { name: "Idx", type: "singleLineText" },
      { name: "Title", type: "singleLineText" },
      { name: "Category", type: "singleLineText" },
      { name: "Date", type: "date", options: { dateFormat: { name: "iso" } } },
      {
        name: "Board",
        type: "singleSelect",
        options: {
          choices: [
            { name: "Residential", color: "tealLight2" },
            { name: "Commercial", color: "purpleLight2" },
          ],
        },
      },
      { name: "Thumb", type: "url" },
      { name: "Views", type: "number", options: { precision: 0 } },
      { name: "Excerpt", type: "multilineText" },
      { name: "BodyText", type: "multilineText" },
      { name: "Images", type: "multilineText" },
      { name: "ContentBlocks", type: "multilineText" },
    ],
  },
];

async function findOrCreateBase() {
  console.log("🔎 Base 목록 조회...");
  const { bases } = await atFetch("https://api.airtable.com/v0/meta/bases");
  const existing = bases.find((b) => b.name === "day1design");
  if (existing) {
    console.log(`✅ 기존 Base 발견: ${existing.id} (${existing.name})`);
    return { id: existing.id, created: false };
  }

  console.log('📝 "day1design" Base가 없습니다. 새로 생성...');

  // 워크스페이스 결정
  let workspaceId = WS_ARG;
  if (!workspaceId) {
    // bases 목록에서 workspace 후보 추출
    const wsIds = [
      ...new Set(bases.map((b) => b.permissionLevel && b.id).filter(Boolean)),
    ];
    // 실제로 Airtable Metadata API는 workspace 목록을 직접 주지 않음 →
    // 첫 base의 workspaceId를 쓰거나 사용자 지정 요구
    if (bases.length > 0 && bases[0].workspaceId) {
      workspaceId = bases[0].workspaceId;
      console.log(`   자동 감지 workspace: ${workspaceId}`);
    } else {
      console.error("❌ Workspace ID를 찾을 수 없습니다.");
      console.error(
        "   Airtable UI에서 URL 확인 후 --workspace=wspXXXXX 옵션으로 재실행하세요.",
      );
      console.error(
        "   또는 UI에서 'day1design' Base를 직접 생성한 뒤 재실행해도 됩니다.",
      );
      process.exit(1);
    }
  }

  if (DRY_RUN) {
    console.log("  [dry-run] base 생성 스킵");
    return { id: "appDRYRUN", created: true };
  }

  const body = {
    name: "day1design",
    workspaceId,
    tables: TABLES.map(({ name, description, fields }) => ({
      name,
      description,
      fields,
    })),
  };
  const res = await atFetch("https://api.airtable.com/v0/meta/bases", {
    method: "POST",
    body: JSON.stringify(body),
  });
  console.log(`✅ Base 생성: ${res.id} (workspace ${workspaceId})`);
  return { id: res.id, created: true, tablesCreated: true };
}

async function ensureTables(baseId) {
  console.log(`🔎 Base ${baseId} 테이블 목록 조회...`);
  const { tables } = await atFetch(
    `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
  );
  const existing = new Set(tables.map((t) => t.name));

  for (const t of TABLES) {
    if (existing.has(t.name)) {
      console.log(`   ✓ ${t.name} 이미 존재`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`   [dry-run] ${t.name} 생성 (필드 ${t.fields.length}개)`);
      continue;
    }
    console.log(`   + ${t.name} 생성 중 (필드 ${t.fields.length}개)...`);
    await atFetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
      method: "POST",
      body: JSON.stringify({
        name: t.name,
        description: t.description,
        fields: t.fields,
      }),
    });
    console.log(`     ✅ ${t.name}`);
  }
}

(async () => {
  try {
    const { id: baseId, tablesCreated } = await findOrCreateBase();
    if (!tablesCreated) await ensureTables(baseId);

    if (!DRY_RUN) {
      writeDotEnv(DEV_VARS, { AIRTABLE_BASE_ID: baseId });
      writeDotEnv(ENV_LOCAL, {
        AIRTABLE_TOKEN: TOKEN,
        AIRTABLE_BASE_ID: baseId,
      });
      console.log(`\n✅ 셋업 완료.`);
      console.log(`   Base ID: ${baseId}`);
      console.log(`   기록 위치: worker/.dev.vars, site/.env.local`);
      console.log(`\n다음 단계:`);
      console.log(`   node scripts/migrate-to-airtable.js --target=all`);
      console.log(`   cd worker && wrangler deploy`);
    } else {
      console.log(`\n[dry-run] 실제 변경 없음.`);
    }
  } catch (e) {
    console.error("\n❌ 실패:", e.message);
    process.exit(1);
  }
})();
