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

// 전화 질문 key 인식 — 워커 FIELD_RULES 의 phone 행과 **같은 규칙**을 쓴다.
// (SSoT: worker/src/routes/meta-lead.js FIELD_RULES / normalizeQuestionKey)
// 폴러 쪽이 더 좁으면 새 폼이 '핸드폰번호'·'mobile' 로 물었을 때 폴러만 못 읽는다.
// 가드: worker/tests/meta-lead-poll.test.mjs 의 [guard] 폴러-워커 전화 키워드 동기화
export const PHONE_TOKENS = [
  "phone number",
  "phone",
  "연락처",
  "전화",
  "휴대폰",
  "핸드폰",
  "mobile",
];

export function normalizeQuestionKey(raw) {
  return String(raw ?? "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function isPhoneQuestion(rawKey) {
  const key = normalizeQuestionKey(rawKey);
  return PHONE_TOKENS.some((t) => key.includes(t));
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
  const phoneField = fieldData.find((f) => isPhoneQuestion(f.name));
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

// ─── 폼 자동 발견 ───
// Make 웹훅은 페이지 단위라 새 양식을 만들어도 자동으로 커버됐다. 폴러는 폼 ID 목록 기반이라
// 그대로 두면 새 양식의 리드가 조용히 누락된다(폴러는 정상 동작으로 보이므로 알림도 안 뜬다).
// 그래서 매 실행마다 페이지의 ACTIVE 폼을 열거해 조회 대상에 합친다.
// leadgen_forms 열거는 페이지 액세스 토큰을 요구한다(시스템 토큰 직접 호출은 #190).
async function resolvePageToken({ token, appSecret, graphVersion, pageId, fetchImpl }) {
  const url = new URL(`https://graph.facebook.com/${graphVersion}/me/accounts`);
  url.searchParams.set("fields", "id,access_token");
  url.searchParams.set("limit", "50");
  url.searchParams.set("access_token", token);
  const proof = appSecretProof(token, appSecret);
  if (proof) url.searchParams.set("appsecret_proof", proof);
  const res = await fetchImpl(url.toString());
  const data = await res.json();
  if (!res.ok || data?.error) {
    throw new Error(
      `페이지 토큰 조회 실패: ${String(data?.error?.message || res.status).slice(0, 160)}`,
    );
  }
  const page = (data?.data || []).find((p) => String(p?.id) === String(pageId));
  if (!page?.access_token) {
    throw new Error(`페이지(${pageId}) 액세스 토큰 없음 — 자산 할당 확인 필요`);
  }
  return page.access_token;
}

// 새 폼 알림에 질문 목록을 실어 보낸다 — 매핑 손볼 게 있는지 알림만 보고 판단할 수 있게.
export async function fetchFormQuestions({
  formId,
  pageToken,
  graphVersion,
  fetchImpl = fetch,
}) {
  const url = new URL(
    `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(formId)}`,
  );
  url.searchParams.set("fields", "questions");
  url.searchParams.set("access_token", pageToken);
  const res = await fetchImpl(url.toString());
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) return [];
  return (data?.questions || []).map((q) => String(q?.key || q?.label || ""));
}

export async function discoverActiveForms({
  pageId,
  pageToken,
  graphVersion,
  fetchImpl = fetch,
}) {
  const url = new URL(
    `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(pageId)}/leadgen_forms`,
  );
  url.searchParams.set("fields", "id,name,status");
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", pageToken);
  const res = await fetchImpl(url.toString());
  const data = await res.json();
  if (!res.ok || data?.error) {
    throw new Error(
      `폼 목록 조회 실패: ${String(data?.error?.message || res.status).slice(0, 160)}`,
    );
  }
  return (data?.data || [])
    .filter((f) => String(f?.status || "").toUpperCase() === "ACTIVE")
    .map((f) => ({ id: String(f.id), name: String(f.name || "") }));
}

function emptyState(cutoverAt) {
  return {
    version: 1,
    cutoverAt,
    highWatermarkAt: cutoverAt,
    lastSuccessfulPollAt: "",
    knownFormIds: [],
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
    // 워커가 captured 로 회신하면 원문(R2)·'오류' 카드(D1)·알림까지 이미 남긴 뒤다.
    // 재시도해도 결과가 같으므로 실패로 보지 않는다 — 이 한 건 때문에 뒤 리드가 밀리면 안 된다.
    if (data?.captured) {
      return { captured: true, reason: String(data?.error || "").slice(0, 120) };
    }
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
  const explicitFormIds = parseFormIds(process.env.META_LEAD_FORM_IDS);
  const pageId = String(process.env.META_LEAD_PAGE_ID || "").trim();
  const excluded = new Set(parseFormIds(process.env.META_LEAD_FORM_EXCLUDE));
  if (!explicitFormIds.length && !pageId) {
    throw new Error(
      "META_LEAD_FORM_IDS 또는 META_LEAD_PAGE_ID 중 하나는 있어야 합니다.",
    );
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

    // 조회 대상 폼 = 명시 목록 ∪ 페이지에서 발견한 ACTIVE 폼 − 제외목록.
    // 발견이 실패해도(권한/일시장애) 명시 목록이 있으면 수집을 멈추지 않는다.
    let discovered = [];
    let pageToken = "";
    let discoveryNote = pageId ? "ok" : "off";
    if (pageId) {
      try {
        pageToken = await resolvePageToken({
          token,
          appSecret,
          graphVersion,
          pageId,
          fetchImpl,
        });
        discovered = await discoverActiveForms({
          pageId,
          pageToken,
          graphVersion,
          fetchImpl,
        });
      } catch (error) {
        discoveryNote = "fail";
        console.error(
          `${TAG} form-discovery ${String(error?.message || error).slice(0, 240)}`,
        );
        if (!explicitFormIds.length) throw error;
      }
    }
    const formIds = [
      ...new Set([...explicitFormIds, ...discovered.map((f) => f.id)]),
    ].filter((id) => !excluded.has(id));
    if (!formIds.length) throw new Error("조회할 폼이 없습니다.");

    // 새 양식이 생기면 알린다 — 이전 실행 기록이 있을 때만(첫 실행 전체 알림 방지)
    const knownFormIds = Array.isArray(state.knownFormIds) ? state.knownFormIds : [];
    const newForms = discovered.filter(
      (f) => knownFormIds.length > 0 && !knownFormIds.includes(f.id),
    );

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
      console.log(
        `${TAG} forms=${formIds.join(",")} discovery=${discoveryNote}` +
          (discovered.length
            ? ` (${discovered.map((f) => `${f.id}:${f.name}`).join(" | ")})`
            : ""),
      );
      printInspect(leads);
      return { fetched: leads.length, delivered: 0, duplicates: 0, skipped: false };
    }

    let delivered = 0;
    let duplicates = 0;
    let captured = 0;
    const failures = [];
    let newestMs = Math.max(
      cutoverMs,
      Number.isFinite(highWatermarkMs) ? highWatermarkMs : 0,
    );
    // 전달 실패한 리드 중 가장 오래된 것. 워터마크를 이 시각으로 되돌려
    // "성공할 때까지 조회 창 안에 계속 남게" 한다(누락 0).
    let oldestFailureMs = Infinity;
    const processed = { ...state.processed };
    for (const lead of leads) {
      const payload = buildLeadPayload(lead);
      const createdMs = Date.parse(payload.createdTime);
      newestMs = Math.max(newestMs, Number.isFinite(createdMs) ? createdMs : 0);
      if (processed[payload.leadId]) continue;
      if (dryRun) continue;
      // 전화번호를 못 읽어도 여기서 막지 않는다. 워커가 R2 원문 + D1 '오류' 카드로
      // 캡처하고 captured 를 회신하므로 흔적은 남고 큐는 계속 흐른다.
      try {
        const result = await postLead({
          webhookUrl,
          webhookSecret,
          payload,
          fetchImpl,
        });
        if (result?.captured) captured += 1;
        else if (result?.duplicate) duplicates += 1;
        else delivered += 1;
        processed[payload.leadId] = payload.createdTime || new Date().toISOString();
      } catch (error) {
        // 워커 장애·네트워크 오류 등 일시적 실패. processed 에 넣지 않으므로 다음 실행이 재시도한다.
        failures.push(String(error?.message || error).slice(0, 200));
        if (Number.isFinite(createdMs)) {
          oldestFailureMs = Math.min(oldestFailureMs, createdMs);
        }
      }
    }

    const detail =
      `forms=${formIds.length} fetched=${leads.length} delivered=${delivered}` +
      ` duplicates=${duplicates} captured=${captured} failed=${failures.length}` +
      ` discovery=${discoveryNote}`;
    if (!dryRun) {
      // 상태 저장이 먼저 — 하트비트가 실패해도 같은 리드를 다시 보내지 않는다.
      // 실패건이 있으면 워터마크를 그 리드 시각으로 되돌린다. 실패가 며칠 이어져도
      // 다음 조회 창(워터마크 − 48h)에 반드시 포함되므로 유실되지 않는다.
      const retentionFloor = Math.max(
        cutoverMs,
        nowMs - Math.max(lookbackMs, overlapMs) * 2,
      );
      const watermarkMs = Math.min(
        Math.max(newestMs, nowMs),
        oldestFailureMs,
      );
      await writeState(statePath, {
        version: 1,
        cutoverAt,
        highWatermarkAt: new Date(watermarkMs).toISOString(),
        lastSuccessfulPollAt: new Date(nowMs).toISOString(),
        knownFormIds: discovered.length
          ? discovered.map((f) => f.id)
          : knownFormIds,
        processed: pruneProcessed(processed, retentionFloor),
      });
      // 새 양식은 조용히 지나가면 안 된다 — 매핑 확인이 필요할 수 있으므로 알린다.
      if (newForms.length) {
        const lines = ["[day1design/meta-lead-poller] 🆕 새 리드 양식 감지"];
        for (const f of newForms) {
          lines.push(`· ${f.name} (${f.id})`);
          const questions = pageToken
            ? await fetchFormQuestions({
                formId: f.id,
                pageToken,
                graphVersion,
                fetchImpl,
              })
            : [];
          if (questions.length) {
            lines.push(`   질문: ${questions.join(" / ")}`.slice(0, 500));
          }
        }
        lines.push("자동으로 수집 대상에 포함됩니다. 질문 문구가 기존과 다르면 워커 매핑 확인.");
        await sendTelegram({
          botToken: String(process.env.HEALTH_TELEGRAM_BOT_TOKEN || "").trim(),
          chatId: String(process.env.HEALTH_TELEGRAM_CHAT_ID || "").trim(),
          message: lines.join("\n"),
          fetchImpl,
        });
      }
      // 전달 실패는 반드시 드러낸다 — main() 이 fail 하트비트 + 인프라봇 알림을 맡는다.
      // 상태는 이미 저장했으므로 성공한 리드는 재전송되지 않고, 실패한 리드만 다음 실행이 재시도한다.
      if (failures.length) {
        throw new Error(
          `리드 전달 실패 ${failures.length}/${leads.length}건 — ${failures[0]}`,
        );
      }
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
    return {
      fetched: leads.length,
      delivered,
      duplicates,
      captured,
      skipped: false,
    };
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
