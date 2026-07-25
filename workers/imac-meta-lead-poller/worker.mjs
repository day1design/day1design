#!/usr/bin/env node
// ─── day1design Meta 리드 폴러 (아이맥 LaunchAgent, one-shot) ───
// Meta 인스턴트폼 리드를 시스템 사용자 토큰으로 조회해 day1design 워커로 전달한다.
// Make 시나리오 대체용. 폴라애드/자수성가 폴러와 동일 패턴.
//
// 설계 요점
//  - 원본 field_data 를 그대로 워커로 넘긴다. 필드 매핑은 워커가 담당(매핑 수정 시 워커만 재배포).
//  - leadId 가 워커에서 D1 유니크(MetaLeadId)로 쓰이므로, 상태파일이 날아가거나
//    조회 구간이 겹쳐도 중복 접수/중복 문자는 서버가 막는다.
//  - 매 실행마다 하트비트 1회 → 리드가 0건이어도 "살아있음"이 서버에 남는다.
//    실패 시에는 하트비트(status=fail) + 텔레그램 인프라봇 양쪽으로 알린다.
//
// 검증: node --check worker.mjs / node --test worker.test.mjs
//       META_LEAD_DRY_RUN=1 node worker.mjs   (조회만, 전달·발송 없음)
//       node worker.mjs --inspect             (폼 질문 key 확인용, 값은 마스킹)

import { createHmac } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const TAG = "[day1design/imac-meta-lead-poller]";
const DEFAULT_GRAPH_VERSION = "v21.0";
const DEFAULT_LOOKBACK_HOURS = 48;
const DEFAULT_OVERLAP_HOURS = 48;
const DEFAULT_MAX_PAGES = 10;
const DEFAULT_STATE_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "state.json",
);
const LOCK_STALE_MS = 10 * 60 * 1000;

function envRequired(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} 환경변수가 필요합니다.`);
  return value;
}

function envNumber(name, fallback) {
  const raw = String(process.env[name] || "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name}은 0보다 큰 숫자여야 합니다.`);
  }
  return value;
}

function envFlag(name) {
  return ["1", "true", "yes", "on"].includes(
    String(process.env[name] || "")
      .trim()
      .toLowerCase(),
  );
}

export function parseFormIds(raw) {
  return [...new Set(String(raw || "").split(",").map((v) => v.trim()))]
    .filter(Boolean)
    .filter((v) => /^\d+$/.test(v));
}

export function normalizePhone(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("82")) digits = `0${digits.slice(2)}`;
  return digits;
}

// 워커로 보내는 페이로드 — 매핑하지 않고 원본을 그대로 싣는다.
// phone 만 전화형식 정규화해서 함께 보낸다(워커 필수값 검증 + 폴러 단계 사전 점검용).
export function buildLeadPayload(lead) {
  const fieldData = (Array.isArray(lead?.field_data) ? lead.field_data : []).map(
    (field) => ({
      name: String(field?.name || ""),
      values: Array.isArray(field?.values)
        ? field.values.map((v) => String(v ?? ""))
        : [],
    }),
  );
  const phoneField = fieldData.find((f) => {
    const k = f.name.toLowerCase();
    return (
      k === "phone_number" ||
      k.includes("phone") ||
      k.includes("연락처") ||
      k.includes("전화") ||
      k.includes("휴대")
    );
  });
  return {
    leadId: String(lead?.id || "").trim(),
    createdTime: String(lead?.created_time || "").trim(),
    platform: String(lead?.platform || "").trim(),
    adName: String(lead?.ad_name || "").trim(),
    campaignName: String(lead?.campaign_name || "").trim(),
    formId: String(lead?.form_id || "").trim(),
    adId: String(lead?.ad_id || "").trim(),
    phone: normalizePhone((phoneField?.values || []).join("")),
    fieldData,
  };
}

export function computeSinceMs({
  nowMs,
  cutoverMs,
  highWatermarkMs,
  lookbackMs,
  overlapMs,
}) {
  const recoveryFloor = highWatermarkMs
    ? highWatermarkMs - overlapMs
    : nowMs - lookbackMs;
  return Math.max(cutoverMs, recoveryFloor);
}

export function sanitizePagingUrl(raw) {
  const url = new URL(raw);
  url.searchParams.delete("access_token");
  return url.toString();
}

function parseRequiredTime(name, raw) {
  const value = Date.parse(String(raw || ""));
  if (!Number.isFinite(value)) {
    throw new Error(`${name}은 ISO 날짜 형식이어야 합니다.`);
  }
  return value;
}

function appSecretProof(token, secret) {
  if (!secret) return "";
  return createHmac("sha256", secret).update(token).digest("hex");
}

async function fetchFormLeads({
  formId,
  token,
  appSecret,
  graphVersion,
  sinceMs,
  maxPages,
  fetchImpl = fetch,
}) {
  const fields = [
    "id",
    "created_time",
    "platform",
    "ad_name",
    "campaign_name",
    "form_id",
    "ad_id",
    "field_data",
  ].join(",");
  const filtering = JSON.stringify([
    {
      field: "time_created",
      operator: "GREATER_THAN_OR_EQUAL",
      value: Math.floor(sinceMs / 1000),
    },
  ]);
  const initial = new URL(
    `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(formId)}/leads`,
  );
  initial.searchParams.set("fields", fields);
  initial.searchParams.set("filtering", filtering);
  initial.searchParams.set("limit", "100");
  const proof = appSecretProof(token, appSecret);
  if (proof) initial.searchParams.set("appsecret_proof", proof);

  const leads = [];
  let next = initial.toString();
  let pages = 0;
  while (next && pages < maxPages) {
    pages += 1;
    const response = await fetchImpl(next, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok || data?.error) {
      const message = String(
        data?.error?.message || `HTTP ${response.status}`,
      ).slice(0, 240);
      throw new Error(`form=${formId} Meta 조회 실패: ${message}`);
    }
    leads.push(...(Array.isArray(data?.data) ? data.data : []));
    next = data?.paging?.next ? sanitizePagingUrl(data.paging.next) : "";
  }
  if (next) throw new Error(`form=${formId} Meta 페이징 상한(${maxPages}) 초과`);
  return leads;
}

function emptyState(cutoverAt) {
  return {
    version: 1,
    cutoverAt,
    highWatermarkAt: cutoverAt,
    lastSuccessfulPollAt: "",
    processed: {},
  };
}

async function readState(path, cutoverAt) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (!parsed || parsed.version !== 1 || typeof parsed.processed !== "object") {
      return emptyState(cutoverAt);
    }
    return { ...emptyState(cutoverAt), ...parsed, cutoverAt };
  } catch (error) {
    if (error?.code === "ENOENT") return emptyState(cutoverAt);
    throw error;
  }
}

async function writeState(path, state) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, path);
}

function pruneProcessed(processed, floorMs) {
  const next = {};
  for (const [leadId, createdTime] of Object.entries(processed || {})) {
    const createdMs = Date.parse(String(createdTime || ""));
    if (!Number.isFinite(createdMs) || createdMs >= floorMs) next[leadId] = createdTime;
  }
  return next;
}

async function acquireLock(path) {
  const tryOpen = () => open(path, "wx", 0o600);
  try {
    return await tryOpen();
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    try {
      const info = await stat(path);
      if (Date.now() - info.mtimeMs > LOCK_STALE_MS) {
        await rm(path, { force: true });
        return await tryOpen();
      }
    } catch (statError) {
      if (statError?.code !== "ENOENT") throw statError;
      return await tryOpen();
    }
    return null;
  }
}

// 워커 인증은 X-Meta-Lead-Secret 헤더 (day1design 워커 규약)
async function postLead({ webhookUrl, webhookSecret, payload, fetchImpl = fetch }) {
  const response = await fetchImpl(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Meta-Lead-Secret": webhookSecret,
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    throw new Error(
      `lead=${payload.leadId} webhook 실패: ${String(
        data?.error || `HTTP ${response.status}`,
      ).slice(0, 200)}`,
    );
  }
  return data;
}

export async function sendHeartbeat({
  webhookUrl,
  webhookSecret,
  status,
  detail,
  fetchImpl = fetch,
}) {
  const url = new URL(webhookUrl);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/heartbeat`;
  const response = await fetchImpl(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Meta-Lead-Secret": webhookSecret,
    },
    body: JSON.stringify({ source: "meta-lead-poller", status, detail }),
  });
  if (!response.ok) {
    throw new Error(`하트비트 실패: HTTP ${response.status}`);
  }
}

function formatKst(ms) {
  const shifted = new Date(ms + 9 * 60 * 60 * 1000).toISOString();
  return `${shifted.slice(0, 10)} ${shifted.slice(11, 16)} KST`;
}

export function formatFailureMessage(error, checkedAtMs) {
  const reason = String(error?.message || error || "unknown").slice(0, 240);
  return [
    "[day1design/meta-lead-poller] 🔴 리드 조회 실패",
    `사유: ${reason}`,
    `시각: ${formatKst(checkedAtMs)}`,
  ].join("\n");
}

async function sendTelegram({ botToken, chatId, message, fetchImpl = fetch }) {
  if (!botToken || !chatId) return;
  await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      disable_web_page_preview: true,
    }),
  });
}

// --inspect: 폼 질문 key 를 확인하기 위한 조회 전용 모드.
// 개인정보 보호를 위해 값은 길이만 표기하고 원문은 출력하지 않는다.
function printInspect(leads) {
  const keys = new Map();
  for (const lead of leads) {
    for (const field of lead?.field_data || []) {
      const name = String(field?.name || "");
      const sample = (field?.values || []).join(", ");
      const prev = keys.get(name) || { count: 0, len: 0 };
      keys.set(name, { count: prev.count + 1, len: Math.max(prev.len, sample.length) });
    }
  }
  console.log(`${TAG} inspect leads=${leads.length}`);
  for (const [name, info] of keys) {
    console.log(`  key="${name}" seen=${info.count} maxValueLen=${info.len}`);
  }
}

export async function runPoll({ fetchImpl = fetch } = {}) {
  const dryRun = envFlag("META_LEAD_DRY_RUN");
  const inspect = process.argv.includes("--inspect");
  const readOnly = dryRun || inspect;
  const token = envRequired("META_SYSTEM_USER_TOKEN");
  const formIds = parseFormIds(envRequired("META_LEAD_FORM_IDS"));
  if (formIds.length === 0) {
    throw new Error("META_LEAD_FORM_IDS에 유효한 폼 ID가 없습니다.");
  }
  const cutoverAt = envRequired("META_LEAD_CUTOVER_AT");
  const cutoverMs = parseRequiredTime("META_LEAD_CUTOVER_AT", cutoverAt);
  const webhookUrl = readOnly
    ? String(process.env.LEAD_WEBHOOK_URL || "").trim()
    : envRequired("LEAD_WEBHOOK_URL");
  const webhookSecret = readOnly ? "" : envRequired("LEAD_WEBHOOK_SECRET");
  const graphVersion = String(
    process.env.META_GRAPH_VERSION || DEFAULT_GRAPH_VERSION,
  ).trim();
  const appSecret = String(process.env.META_APP_SECRET || "").trim();
  const lookbackMs =
    envNumber("META_LEAD_LOOKBACK_HOURS", DEFAULT_LOOKBACK_HOURS) * 3600000;
  const overlapMs =
    envNumber("META_LEAD_OVERLAP_HOURS", DEFAULT_OVERLAP_HOURS) * 3600000;
  const maxPages = envNumber("META_LEAD_MAX_PAGES", DEFAULT_MAX_PAGES);
  const statePath = resolve(process.env.META_LEAD_STATE_FILE || DEFAULT_STATE_FILE);
  const lockPath = `${statePath}.lock`;
  await mkdir(dirname(statePath), { recursive: true });
  const lock = await acquireLock(lockPath);
  if (!lock) {
    console.log(`${TAG} skip reason=already-running`);
    return { fetched: 0, delivered: 0, duplicates: 0, skipped: true };
  }

  try {
    const state = await readState(statePath, cutoverAt);
    const highWatermarkMs = Date.parse(state.highWatermarkAt || "");
    const nowMs = Date.now();
    const sinceMs = computeSinceMs({
      nowMs,
      cutoverMs,
      highWatermarkMs: Number.isFinite(highWatermarkMs) ? highWatermarkMs : 0,
      lookbackMs,
      overlapMs,
    });

    const allLeads = [];
    for (const formId of formIds) {
      allLeads.push(
        ...(await fetchFormLeads({
          formId,
          token,
          appSecret,
          graphVersion,
          sinceMs,
          maxPages,
          fetchImpl,
        })),
      );
    }

    const byId = new Map();
    for (const lead of allLeads) {
      const leadId = String(lead?.id || "").trim();
      const createdMs = Date.parse(String(lead?.created_time || ""));
      if (leadId && Number.isFinite(createdMs) && createdMs >= sinceMs) {
        byId.set(leadId, lead);
      }
    }
    const leads = [...byId.values()].sort(
      (a, b) => Date.parse(a.created_time) - Date.parse(b.created_time),
    );

    if (inspect) {
      printInspect(leads);
      return { fetched: leads.length, delivered: 0, duplicates: 0, skipped: false };
    }

    let delivered = 0;
    let duplicates = 0;
    let newestMs = Math.max(
      cutoverMs,
      Number.isFinite(highWatermarkMs) ? highWatermarkMs : 0,
    );
    const processed = { ...state.processed };
    for (const lead of leads) {
      const payload = buildLeadPayload(lead);
      const createdMs = Date.parse(payload.createdTime);
      newestMs = Math.max(newestMs, Number.isFinite(createdMs) ? createdMs : 0);
      if (processed[payload.leadId]) continue;
      if (!payload.phone) {
        throw new Error(`lead=${payload.leadId} 전화번호 필드가 없어 전달할 수 없습니다.`);
      }
      if (dryRun) continue;
      const result = await postLead({ webhookUrl, webhookSecret, payload, fetchImpl });
      if (result?.duplicate) duplicates += 1;
      else delivered += 1;
      processed[payload.leadId] = payload.createdTime || new Date().toISOString();
    }

    const detail = `forms=${formIds.length} fetched=${leads.length} delivered=${delivered} duplicates=${duplicates}`;
    if (!dryRun) {
      // 상태 저장이 먼저 — 하트비트가 실패해도 같은 리드를 다시 보내지 않는다.
      const retentionFloor = Math.max(
        cutoverMs,
        nowMs - Math.max(lookbackMs, overlapMs) * 2,
      );
      await writeState(statePath, {
        version: 1,
        cutoverAt,
        highWatermarkAt: new Date(Math.max(newestMs, nowMs)).toISOString(),
        lastSuccessfulPollAt: new Date(nowMs).toISOString(),
        processed: pruneProcessed(processed, retentionFloor),
      });
      await sendHeartbeat({
        webhookUrl,
        webhookSecret,
        status: "ok",
        detail,
        fetchImpl,
      });
    }

    console.log(
      `${TAG} ok dryRun=${dryRun} ${detail} since=${new Date(sinceMs).toISOString()}`,
    );
    return { fetched: leads.length, delivered, duplicates, skipped: false };
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

async function main() {
  try {
    await runPoll();
  } catch (error) {
    console.error(`${TAG} error ${String(error?.message || error).slice(0, 500)}`);
    if (!envFlag("META_LEAD_DRY_RUN") && !process.argv.includes("--inspect")) {
      const webhookUrl = String(process.env.LEAD_WEBHOOK_URL || "").trim();
      const webhookSecret = String(process.env.LEAD_WEBHOOK_SECRET || "").trim();
      // 1) 서버에 실패 하트비트 (헬스체크가 즉시 fail 로 본다)
      if (webhookUrl && webhookSecret) {
        try {
          await sendHeartbeat({
            webhookUrl,
            webhookSecret,
            status: "fail",
            detail: String(error?.message || error).slice(0, 240),
          });
        } catch (hbError) {
          console.error(
            `${TAG} heartbeat-error ${String(hbError?.message || hbError).slice(0, 300)}`,
          );
        }
      }
      // 2) 워커까지 못 닿는 상황 대비 — 인프라봇으로 직접 알림
      try {
        await sendTelegram({
          botToken: String(process.env.HEALTH_TELEGRAM_BOT_TOKEN || "").trim(),
          chatId: String(process.env.HEALTH_TELEGRAM_CHAT_ID || "").trim(),
          message: formatFailureMessage(error, Date.now()),
        });
      } catch (tgError) {
        console.error(
          `${TAG} telegram-error ${String(tgError?.message || tgError).slice(0, 300)}`,
        );
      }
    }
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
