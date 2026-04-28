#!/usr/bin/env node
// 기존 JSON/하드코딩 데이터를 Airtable에 업로드하는 1회성 마이그레이션 스크립트
//
// 사용법:
//   node scripts/migrate-to-airtable.js --target=hero|portfolio|community|all [--dry-run]
//
// 필요한 환경변수 (site/.env.local 또는 프로세스 env):
//   AIRTABLE_TOKEN  — Personal Access Token (data.records:read/write 권한)
//   AIRTABLE_BASE_ID — appXXXXXXXXXXXXXX

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

// --- .env.local 로더 ---
function loadEnvLocal() {
  const envPath = path.join(ROOT, "site", ".env.local");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf-8");
  raw.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) return;
    if (!process.env[m[1]]) {
      let v = m[2];
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  });
}
loadEnvLocal();

const TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = process.env.AIRTABLE_BASE_ID;
const DRY_RUN = process.argv.includes("--dry-run");

function getArg(name, fallback) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split("=", 2)[1] : fallback;
}

const TARGET = getArg("target", "all");

if (!TOKEN || !BASE_ID) {
  console.error("❌ AIRTABLE_TOKEN / AIRTABLE_BASE_ID 가 설정되지 않았습니다.");
  console.error("   site/.env.local 또는 환경변수로 주입하세요.");
  process.exit(1);
}

// --- Airtable helper ---
const AT_BASE = `https://api.airtable.com/v0/${BASE_ID}`;

async function atCreateBatch(table, recordsFields) {
  if (DRY_RUN) {
    console.log(
      `  [dry-run] ${table}: would create ${recordsFields.length} records`,
    );
    return recordsFields.map((_, i) => ({ id: `recDRY${i}` }));
  }
  const out = [];
  for (let i = 0; i < recordsFields.length; i += 10) {
    const chunk = recordsFields.slice(i, i + 10);
    const res = await fetch(`${AT_BASE}/${encodeURIComponent(table)}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        records: chunk.map((fields) => ({ fields })),
        typecast: true,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`${table} create ${res.status}: ${t}`);
    }
    const data = await res.json();
    out.push(...(data.records || []));
    process.stdout.write(`  ${table}: ${out.length}/${recordsFields.length}\r`);
  }
  console.log(`  ${table}: ${out.length}/${recordsFields.length} ✓`);
  return out;
}

// --- HERO 마이그레이션 ---
async function migrateHero() {
  const src = path.join(ROOT, "site/data/hero-slides.json");
  const data = JSON.parse(fs.readFileSync(src, "utf-8"));
  const slides = (data.slides || []).slice(0, 10);
  const records = slides.map((s, i) => ({
    Image: s.image,
    Href: s.href || "",
    Alt: s.alt || "",
    Order: i,
    Active: true,
  }));
  console.log(`\n[HERO] ${records.length}건 준비`);
  await atCreateBatch("HeroSlides", records);
}

// --- PORTFOLIO 마이그레이션 ---
// main.js의 하드코딩 projectData를 그대로 복사 (단일 소스 유지)
const PORTFOLIO_DATA = [
  { name: "판교 TH212 47py", folder: "판교-th212-47py", count: 22 },
  { name: "판교 TH212 46py", folder: "판교-th212-46py", count: 20 },
  {
    name: "판교 원마을 2단지 38py",
    folder: "판교-원마을-2단지-38py",
    count: 22,
  },
  {
    name: "판교 봇들마을 4단지 29py",
    folder: "판교-봇들마을-4단지-29py",
    count: 23,
  },
  { name: "목동 우성2차 42py", folder: "목동-우성2차-42py", count: 46 },
  {
    name: "마북동 블루밍구성센트럴 59py",
    folder: "마북동-블루밍구성센트럴-59py",
    count: 30,
  },
  {
    name: "판교 원마을12단지 43py",
    folder: "판교-원마을12단지-43py",
    count: 50,
  },
  {
    name: "분당 미켈란쉐르빌 58py",
    folder: "분당-미켈란쉐르빌-58py",
    count: 38,
  },
  { name: "도곡렉슬 43py", folder: "도곡렉슬-43py", count: 32 },
  {
    name: "서울숲 푸르지오 2차 44py",
    folder: "서울숲-푸르지오-2차-44py",
    count: 69,
  },
  {
    name: "성남 연꽃마을4단지 50py",
    folder: "성남-연꽃마을4단지-50py",
    count: 121,
  },
  {
    name: "용인 신봉마을 4단지 동일하이빌 58py",
    folder: "용인-신봉마을-4단지-동일하이빌-58py",
    count: 91,
  },
  {
    name: "판교 푸르지오그랑블 38py",
    folder: "판교-푸르지오그랑블-38py",
    count: 48,
  },
  {
    name: "동천마을 현대홈타운 37py",
    folder: "동천마을-현대홈타운-37py",
    count: 10,
  },
  { name: "신반포 2차 34py", folder: "신반포-2차-34py", count: 8 },
  { name: "잠실리센츠 33py", folder: "잠실리센츠-33py", count: 16 },
  {
    name: "용인 대지마을 중앙하이츠빌 68py",
    folder: "용인-대지마을-중앙하이츠빌-68py",
    count: 34,
  },
  {
    name: "판교산운마을 14단지 44py",
    folder: "판교산운마을-14단지-44py",
    count: 14,
  },
  {
    name: "송도 웰카운티 3단지 45py",
    folder: "송도-웰카운티-3단지-45py",
    count: 34,
  },
  { name: "분당 아펠바움 112py", folder: "분당-아펠바움-112py", count: 14 },
  {
    name: "용산 효창베네스아파트 47py",
    folder: "용산-효창베네스아파트-47py",
    count: 22,
  },
  {
    name: "마포 카이저팰리스 49py",
    folder: "마포-카이저팰리스-49py",
    count: 62,
  },
  { name: "용인 성복자이1차 39py", folder: "용인-성복자이1차-39py", count: 12 },
  {
    name: "분당 백현마을 6단지 34py",
    folder: "분당-백현마을-6단지-34py",
    count: 15,
  },
  { name: "서울숲 푸르지오 41py", folder: "서울숲-푸르지오-41py", count: 34 },
  { name: "부천 아이파크 34py", folder: "부천-아이파크-34py", count: 13 },
  {
    name: "송도 힐스테이트 더스카이 34py",
    folder: "송도-힐스테이트-더스카이-34py",
    count: 21,
  },
  {
    name: "청담 이편한세상 2차 41py",
    folder: "청담-이편한세상-2차-41py",
    count: 38,
  },
  { name: "송파 위례 24단지 25py", folder: "송파-위례-24단지-25py", count: 66 },
  { name: "성남 센트럴타운 33py", folder: "성남-센트럴타운-33py", count: 6 },
  {
    name: "서울역 센트럴자이 34py",
    folder: "서울역-센트럴자이-34py",
    count: 17,
  },
  { name: "안양 박달벽산 40py", folder: "안양-박달벽산-40py", count: 14 },
  { name: "성남 센트럴타운 34py", folder: "성남-센트럴타운-34py", count: 14 },
  {
    name: "송도 더샵 퍼스트월드 56py",
    folder: "송도-더샵-퍼스트월드-56py",
    count: 52,
  },
  {
    name: "송도 더샵 퍼스트월드 65py",
    folder: "서울역-센트럴자이-34py",
    count: 17,
    rightFolder: "송도-더샵-퍼스트월드-56py",
    rightCount: 52,
    rightName: "송도 더샵 퍼스트월드 56py",
  },
];

async function migratePortfolio() {
  const records = PORTFOLIO_DATA.map((p, i) => {
    const f = {
      Name: p.name,
      Folder: p.folder,
      Count: p.count,
      Category: "HOUSE",
      Order: i,
    };
    if (p.rightFolder) f.RightFolder = p.rightFolder;
    if (p.rightCount) f.RightCount = p.rightCount;
    if (p.rightName) f.RightName = p.rightName;
    return f;
  });
  console.log(`\n[PORTFOLIO] ${records.length}건 준비`);
  await atCreateBatch("Portfolio", records);
}

// --- COMMUNITY 마이그레이션 ---
async function migrateCommunity() {
  const src = path.join(ROOT, "site/data/community.json");
  const data = JSON.parse(fs.readFileSync(src, "utf-8"));
  const posts = data.posts || [];
  const records = posts.map((p) => {
    const excerpt = (p.body_text || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
    return {
      Idx: String(p.idx),
      Title: p.title || "",
      Category: p.category || "",
      Date: p.date || "",
      Board: p.board || "Residential",
      Thumb: p.thumb || "",
      Views: Number(p.views || 0),
      Excerpt: excerpt,
      BodyText: p.body_text || "",
      Images: JSON.stringify(p.images || []),
      ContentBlocks: JSON.stringify(p.content_blocks || []),
    };
  });
  console.log(`\n[COMMUNITY] ${records.length}건 준비`);
  await atCreateBatch("Community", records);
}

// --- main ---
(async () => {
  console.log(`Target: ${TARGET}${DRY_RUN ? " (DRY RUN)" : ""}`);
  console.log(`Base: ${BASE_ID}`);
  try {
    if (TARGET === "hero" || TARGET === "all") await migrateHero();
    if (TARGET === "portfolio" || TARGET === "all") await migratePortfolio();
    if (TARGET === "community" || TARGET === "all") await migrateCommunity();
    console.log("\n✅ 마이그레이션 완료");
  } catch (e) {
    console.error("\n❌ 실패:", e.message);
    process.exit(1);
  }
})();
