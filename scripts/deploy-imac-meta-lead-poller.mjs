#!/usr/bin/env node
// day1design Meta 리드 폴러를 아이맥(LaunchAgent)으로 배포한다.
// 값은 프로젝트 로컬 .env.imac-meta-lead.local 에서만 읽고 커밋하지 않는다.
//
//   미리보기: node scripts/deploy-imac-meta-lead-poller.mjs
//   실제배포: node scripts/deploy-imac-meta-lead-poller.mjs --run
//
// 원격에서 node --check / plutil -lint 를 통과한 뒤에만 교체하므로
// 문법 오류가 있는 파일이 그대로 스케줄에 올라가지 않는다.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const workerDir = resolve(root, "workers/imac-meta-lead-poller");
const envPath = resolve(root, ".env.imac-meta-lead.local");
const workerFile = resolve(workerDir, "worker.mjs");
const plistFile = resolve(workerDir, "com.day1design.meta-lead-poller.plist");
const host = process.env.IMAC_HOST || "imac";
const remoteDir = "/Users/pola/day1design-meta-lead-poller";
const launchDir = "/Users/pola/Library/LaunchAgents";
const plistName = "com.day1design.meta-lead-poller.plist";
const remoteWorkerStage = `${remoteDir}/worker.new.mjs`;
const remotePlistStage = `${launchDir}/com.day1design.meta-lead-poller.new.plist`;
const run = process.argv.includes("--run");

for (const path of [workerFile, plistFile, envPath]) {
  if (!existsSync(path)) throw new Error(`필수 파일 없음: ${path}`);
}

function parseEnv(path) {
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (/\r|\n/.test(value)) throw new Error(`${match[1]} 값에 개행이 있습니다.`);
    values[match[1]] = value;
  }
  return values;
}

const sourceEnv = parseEnv(envPath);
const required = [
  "META_SYSTEM_USER_TOKEN",
  "META_LEAD_CUTOVER_AT",
  "LEAD_WEBHOOK_URL",
  "LEAD_WEBHOOK_SECRET",
  "HEALTH_TELEGRAM_BOT_TOKEN",
  "HEALTH_TELEGRAM_CHAT_ID",
];
for (const key of required) {
  if (!sourceEnv[key]) throw new Error(`${key} 누락: ${envPath}`);
}

// 폼 지정은 명시 목록(META_LEAD_FORM_IDS) 또는 페이지 자동발견(META_LEAD_PAGE_ID) 중 하나면 된다.
if (!sourceEnv.META_LEAD_FORM_IDS && !sourceEnv.META_LEAD_PAGE_ID) {
  throw new Error(
    `META_LEAD_FORM_IDS 또는 META_LEAD_PAGE_ID 중 하나는 필요: ${envPath}`,
  );
}

const allowed = [
  ...required,
  "META_LEAD_FORM_IDS",
  "META_LEAD_PAGE_ID",
  "META_LEAD_FORM_EXCLUDE",
  "META_APP_SECRET",
  "META_GRAPH_VERSION",
  "META_LEAD_LOOKBACK_HOURS",
  "META_LEAD_OVERLAP_HOURS",
  "META_LEAD_MAX_PAGES",
  "META_LEAD_STATE_FILE",
  "META_LEAD_DRY_RUN",
];
const remoteEnv = `${allowed
  .filter((key) => sourceEnv[key] !== undefined && sourceEnv[key] !== "")
  .map((key) => `${key}=${sourceEnv[key]}`)
  .join("\n")}\n`;

function exec(command, args, options = {}) {
  execFileSync(command, args, { stdio: "inherit", ...options });
}

if (!run) {
  console.log("[dry-run] 아이맥 Meta 리드 폴러 배포 준비 완료");
  console.log(`host=${host}`);
  console.log(`remote=${remoteDir}`);
  console.log(`envKeys=${allowed.filter((key) => sourceEnv[key]).join(",")}`);
  console.log("실제 배포: node scripts/deploy-imac-meta-lead-poller.mjs --run");
  process.exit(0);
}

exec("ssh", [host, `mkdir -p ${remoteDir}/logs`]);
exec("scp", [workerFile, `${host}:${remoteWorkerStage}`]);
exec("scp", [plistFile, `${host}:${remotePlistStage}`]);
execFileSync(
  "ssh",
  [
    host,
    `umask 077; cat > ${remoteDir}/.env.new; mv ${remoteDir}/.env.new ${remoteDir}/.env`,
  ],
  { input: remoteEnv, stdio: ["pipe", "inherit", "inherit"] },
);
exec("ssh", [
  host,
  [
    "set -e",
    `/usr/local/bin/node --check ${remoteWorkerStage}`,
    `plutil -lint ${remotePlistStage}`,
    `mv ${remoteWorkerStage} ${remoteDir}/worker.mjs`,
    `mv ${remotePlistStage} ${launchDir}/${plistName}`,
    `launchctl bootout gui/501 ${launchDir}/${plistName} 2>/dev/null || true`,
    `launchctl bootstrap gui/501 ${launchDir}/${plistName}`,
    `launchctl kickstart -k gui/501/com.day1design.meta-lead-poller`,
  ].join("; "),
]);
console.log("[deploy] 아이맥 Meta 리드 폴러 배포/재시작 완료");
