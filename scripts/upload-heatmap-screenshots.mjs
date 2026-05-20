// 캡쳐된 스크린샷을 R2 업로드 + HeatmapScreenshots에 등록
// 실행: node scripts/upload-heatmap-screenshots.mjs
// 전제: scripts/capture-heatmap-screenshots.mjs 가 manifest.json 생성 완료

import fs from "fs/promises";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHOTS_DIR = path.join(__dirname, "..", ".scratch-heatmap-shots");
const MANIFEST = path.join(SHOTS_DIR, "manifest.json");
const R2_BUCKET = "day1design-r2";
const R2_PUBLIC_BASE = "https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev";
const KEY_PREFIX = "images/heatmap";
const WORKER_DIR = path.join(__dirname, "..", "worker");

function sh(cmd, opts = {}) {
  return execSync(cmd, {
    cwd: WORKER_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    ...opts,
  });
}

function escapeSql(s) {
  return String(s).replace(/'/g, "''");
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
  console.log(`Loaded ${manifest.length} captures from manifest`);

  const sqlValues = [];
  const now = new Date().toISOString();

  for (const item of manifest) {
    const key = `${KEY_PREFIX}/${item.fileName}`;
    const publicUrl = `${R2_PUBLIC_BASE}/${key}`;
    console.log(`→ R2: ${key}`);
    sh(
      `npx wrangler r2 object put ${R2_BUCKET}/${key} --file="${item.file}" --content-type=image/png`,
    );
    sqlValues.push(
      `('${escapeSql(item.storedPath)}', '${escapeSql(item.device)}', '${escapeSql(publicUrl)}', ${item.page_w}, ${item.page_h}, '${now}')`,
    );
  }

  const sql = `INSERT INTO HeatmapScreenshots (Page, Device, Url, PageW, PageH, CapturedAt) VALUES ${sqlValues.join(",")} ON CONFLICT(Page, Device) DO UPDATE SET Url=excluded.Url, PageW=excluded.PageW, PageH=excluded.PageH, CapturedAt=excluded.CapturedAt;`;

  const sqlFile = path.join(SHOTS_DIR, "_upsert.sql");
  await fs.writeFile(sqlFile, sql);
  console.log(`\n→ D1 upsert (${sqlValues.length} rows)`);
  sh(
    `npx wrangler d1 execute day1design --remote --file="${sqlFile}"`,
  );

  console.log(`\n✓ Upload + register 완료`);
}

main().catch((e) => {
  console.error(e.stdout?.toString?.() || e.message);
  process.exit(1);
});
