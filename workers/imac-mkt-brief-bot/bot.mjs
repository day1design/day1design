// 데이원-마케팅효율봇 — 방에서는 담당자 한 명이지만, 뒤에서는 셋이 나눠 일한다.
//
//   통계(stats.mjs) — 비율·신뢰구간·이상치를 확정한다. 모델은 이 숫자를 인용만 한다.
//   해석(클로드)     — 무슨 일이 있었고 왜인지, 무엇을 할지 초안을 만든다.
//   감사(코덱스)     — 그 초안이 데이터로 버티는지 따진다.
//   종합(코덱스)     — 셋을 받아 최종 보고 하나를 쓴다. 방에는 이것만 나간다.
//
// 해석과 감사를 한 모델에게 맡기지 않는 이유는, 자기가 세운 가설을 자기가 검증하면
// 대개 통과시키기 때문이다. 그리고 계산을 모델에게 맡기지 않는 이유는, 검산할 때마다
// 값이 달라지기 때문이다.
//
// 방에는 과정을 노출하지 않는다. "클로드는 이렇고 코덱스는 저렇다"는 보고는 읽는 사람에게
// 판단을 떠넘기는 것이다. 담당자는 하나의 답을 들고 와야 한다.
//
// 데이터는 워커의 /api/brief/marketing 한 곳에서만 받는다. 단계마다 따로 긁으면
// 호출 시점이 어긋나 같은 기간을 두고 숫자가 달라진다.
//
// 한 단계가 죽어도 남은 것으로 답을 낸다. 침묵이 가장 나쁜 결과다.

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { analyze } from "./stats.mjs";

const DIR = "/Users/pola/day1design-mkt-bot";
const STATE_DIR = path.join(DIR, "state");
const OFFSET_FILE = path.join(STATE_DIR, "offset.json");

loadEnv(path.join(DIR, ".env"));

const TOKEN = process.env.DAY1_MKT_BOT_TOKEN || "";
const CHAT_ID = process.env.DAY1_MKT_CHAT_ID || "";
const BRIEF_API = process.env.BRIEF_API || "https://day1design.co.kr";
const BRIEF_SECRET = process.env.BRIEF_SECRET || "";

const CLAUDE_BIN = process.env.CLAUDE_BIN || "/Users/pola/.local/bin/claude";
const CODEX_BIN = process.env.CODEX_BIN || "/Users/pola/.local/bin/codex";
const CODEX_MODEL = process.env.CODEX_MODEL || "gpt-5.6-sol";

const ANALYZE_TIMEOUT_MS = 8 * 60 * 1000;
const POLL_TIMEOUT_S = 50;
const TG_LIMIT = 3800; // 4096 이 상한이지만 헤더를 붙이므로 여유를 둔다

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

function log(...args) {
  console.log(new Date().toISOString().slice(0, 19).replace("T", " "), ...args);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, obj) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(obj, null, 1));
}

// ── 텔레그램 ────────────────────────────────────────────
async function tg(method, body, timeoutMs = 70000) {
  const ctl = AbortSignal.timeout(timeoutMs);
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
    signal: ctl,
  });
  return res.json();
}

// 텔레그램은 4096자에서 자른다. 문단 경계로 끊어야 읽는 사람이 문장 중간에서 멈추지 않는다
function chunk(text, limit = TG_LIMIT) {
  const out = [];
  let rest = String(text || "").trim();
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n\n", limit);
    if (cut < limit * 0.5) cut = rest.lastIndexOf("\n", limit);
    if (cut < limit * 0.5) cut = limit;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

async function say(text, opts = {}) {
  const parts = chunk(text);
  let first = null;
  for (const part of parts) {
    const r = await tg("sendMessage", {
      chat_id: CHAT_ID,
      text: part,
      disable_web_page_preview: true,
      ...(opts.replyTo ? { reply_to_message_id: opts.replyTo } : {}),
    });
    if (!first) first = r;
    if (!r.ok) log("전송 실패 —", r.description);
  }
  return first;
}

// ── 데이터 수집 ─────────────────────────────────────────
async function fetchBrief(days) {
  const url = `${BRIEF_API}/api/brief/marketing?days=${days}`;
  const res = await fetch(url, {
    headers: { "X-Brief-Secret": BRIEF_SECRET },
    signal: AbortSignal.timeout(60000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`브리프 API ${res.status} ${text.slice(0, 120)}`);
  }
  return JSON.parse(text);
}

// ── 분석기 ──────────────────────────────────────────────
function run(bin, args, input, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      cwd: DIR,
      env: { ...process.env, LANG: "ko_KR.UTF-8" },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let out = "";
    let err = "";
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try {
        child.kill("SIGKILL");
      } catch {}
      resolve({ ok: false, out, error: `${Math.round(timeoutMs / 60000)}분 안에 끝나지 않음` });
    }, timeoutMs);

    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ ok: false, out: "", error: e.message });
    });
    child.on("close", (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const body = out.trim();
      if (!body) {
        resolve({
          ok: false,
          out: "",
          error: (err.trim() || `종료코드 ${code}`).slice(0, 300),
        });
        return;
      }
      resolve({ ok: true, out: body, error: "" });
    });

    child.stdin.end(input, "utf8");
  });
}

// 코덱스는 진행 로그를 그대로 뱉는다. 마지막 답만 남겨야 방이 로그로 덮이지 않는다
function extractCodexAnswer(raw) {
  const lines = String(raw).split("\n");
  const marks = [];
  lines.forEach((l, i) => {
    if (/^codex$/.test(l.trim())) marks.push(i);
  });
  let body = raw;
  if (marks.length) {
    body = lines.slice(marks[marks.length - 1] + 1).join("\n");
  }
  return body
    .replace(/^tokens used[\s\S]*$/m, "")
    .replace(/^warning:.*$/gm, "")
    .trim();
}

// 분석에 필요한 숫자는 전부 프롬프트 안에 있다. 그래서 두 분석기 모두 도구를 빼앗는다 —
// 이 방은 광고 성과를 묻는 자리이지, 파일을 뒤지거나 명령을 실행하는 자리가 아니다.
const CLAUDE_NO_TOOLS = [
  "--disallowed-tools",
  "Bash",
  "Write",
  "Edit",
  "Read",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "Task",
];

async function askClaude(prompt) {
  const r = await run(
    CLAUDE_BIN,
    ["-p", ...CLAUDE_NO_TOOLS],
    prompt,
    ANALYZE_TIMEOUT_MS,
  );
  if (!r.ok) return r;
  // 인증이 끊기면 CLI 가 성공 종료하면서 안내문만 뱉는다. 그걸 분석 결과로 올리면 안 된다
  if (/OAuth session expired|Please run .*login|Invalid API key/i.test(r.out)) {
    return { ok: false, out: "", error: "클로드 로그인이 만료됐습니다" };
  }
  return r;
}

async function askCodex(prompt) {
  const r = await run(
    CODEX_BIN,
    [
      "exec",
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
      "-m",
      CODEX_MODEL,
      "-",
    ],
    prompt,
    ANALYZE_TIMEOUT_MS,
  );
  if (!r.ok) return r;
  const answer = extractCodexAnswer(r.out);
  if (!answer) return { ok: false, out: "", error: "답이 비어 있음" };
  return { ok: true, out: answer, error: "" };
}

// ── 프롬프트 ────────────────────────────────────────────
//
// 분석기는 둘이지만 방에서는 한 명이다. 그래서 역할을 나눈다.
//   해석(클로드) — 무슨 일이 일어났고 왜인지, 무엇을 할지 초안을 만든다.
//   감사(코덱스) — 그 초안이 데이터로 버티는지 따진다. 계산과 표본을 본다.
//   종합(코덱스) — 둘을 받아 최종 브리프 하나를 쓴다. 방에는 이것만 나간다.
//
// 해석과 감사를 한 모델에게 맡기지 않는 이유는, 자기가 세운 가설을 자기가 검증하면
// 대개 통과시키기 때문이다. 초안을 만든 쪽과 따지는 쪽을 갈라야 근거 없는 주장이 걸린다.

const COMMON_RULES = [
  "- 이 대화는 데이원디자인(인테리어 시공사)의 마케팅 성과만 다룹니다.",
  "  유입 분석과 Meta 광고 분석, 견적 접수가 전부입니다. 그 밖의 주제는 다루지 않습니다.",
  "- 파일을 읽거나 명령을 실행하지 마세요. 판단 재료는 전부 이 프롬프트 안에 있습니다.",
  "- JSON 에 없는 수치는 절대 만들지 마세요. 없으면 '데이터 없음'이라고 쓰세요.",
  "- 금액 단위는 USD 입니다. 광고계정 통화가 달러라 spend·costPerLead 모두 달러입니다.",
  "  원화로 바꿔 말하지 마세요(환율을 임의로 곱하면 그 숫자는 거짓이 됩니다).",
  "- costPerLead 는 전체 접수 기준입니다. Meta 광고만의 효율을 말하려면",
  "  leads.bySource 에서 Meta 계열만 골라 다시 계산하고, 그렇게 했다고 밝히세요.",
].join("\n");

function interpretPrompt(question, data, stats) {
  return [
    "당신은 데이원디자인의 마케팅 성과 분석가입니다. 아래는 실제 운영 데이터입니다.",
    "",
    "요청: " + question,
    "",
    "이 단계에서 할 일은 '해석 초안'입니다. 최종 보고서가 아닙니다.",
    "- 기간 안에서 눈에 띄는 변화와 그 원인 가설을 쓰세요.",
    "- 캠페인·소재·유입 경로·요일/시간대 중 성과를 가른 축을 짚으세요.",
    "- 실행 후보를 우선순위와 함께 쓰세요.",
    "- 확신도가 낮은 주장은 '가설'이라고 명시하세요. 뒤 단계에서 검증받습니다.",
    "",
    COMMON_RULES,
    "- 한국어로 1500자 이내. 표와 코드블록은 쓰지 마세요.",
    "",
    "봇이 직접 계산한 통계 — 비율·신뢰구간·이상치는 이 값을 그대로 인용하세요:",
    "```json",
    JSON.stringify(stats),
    "```",
    "",
    "원본 데이터:",
    "```json",
    JSON.stringify(data),
    "```",
  ].join("\n");
}

function auditPrompt(question, data, stats, draft) {
  return [
    "당신은 데이원디자인의 마케팅 데이터 감사자입니다.",
    "아래에 원본 데이터와, 다른 분석가가 쓴 해석 초안이 있습니다.",
    "",
    "원 질문: " + question,
    "",
    "할 일은 초안을 따지는 것입니다. 다시 쓰지 마세요.",
    "1. 초안의 수치가 데이터와 맞는지 직접 계산해 확인하세요. 틀린 숫자를 지목하세요.",
    "2. 데이터로 뒷받침되지 않는 주장을 골라내세요(상관을 인과로 말한 곳 포함).",
    "3. 표본이 부족해 말하면 안 되는 구간을 지적하세요.",
    "   접수는 하루 몇 건 규모라 캠페인별로 쪼개면 대부분 통계적 의미가 없습니다.",
    "4. 초안이 놓친 중요한 신호가 데이터에 있으면 그것도 쓰세요.",
    "",
    COMMON_RULES,
    "- 한국어로 1200자 이내. 항목별로 짧게.",
    "",
    "해석 초안:",
    draft || "(해석 초안 없음 — 데이터만 보고 감사하세요)",
    "",
    "봇이 직접 계산한 통계 — 비율·신뢰구간·이상치는 이 값을 그대로 인용하세요:",
    "```json",
    JSON.stringify(stats),
    "```",
    "",
    "원본 데이터:",
    "```json",
    JSON.stringify(data),
    "```",
  ].join("\n");
}

function synthesizePrompt(question, data, stats, draft, audit) {
  return [
    "당신은 데이원디자인 대표에게 마케팅 성과를 보고하는 담당자입니다.",
    "아래에 원본 데이터, 해석 초안, 감사 의견이 있습니다. 이것들을 종합해",
    "대표가 읽을 최종 보고 하나를 쓰세요.",
    "",
    "원 질문: " + question,
    "",
    "반드시 지킬 것:",
    "- 당신이 혼자 쓴 보고처럼 쓰세요. '해석 초안에 따르면', '감사 결과',",
    "  '분석기 A는' 같은 표현을 절대 쓰지 마세요. 내부 과정은 보고서에 등장하지 않습니다.",
    "- 감사에서 틀렸다고 지적된 숫자와 주장은 버리세요. 살릴 값어치가 있으면",
    "  '가능성' 수준으로 낮춰 쓰고, 무엇을 더 봐야 확실해지는지 한 줄 붙이세요.",
    "- 결론부터 쓰고 근거 숫자를 붙이세요.",
    "",
    "형식:",
    "1) 첫 줄에 기간과 한 줄 결론",
    "2) 핵심 숫자 3~4개 (광고비·접수·리드단가·눈에 띄는 변화)",
    "3) 무슨 일이 있었나 — 3문장 이내",
    "4) 지금 할 것 — 3개 이내, 각각 한 문장으로 구체적으로",
    "5) 주의 — 표본이 부족하거나 데이터가 빈 곳이 있으면 한 줄. 없으면 생략",
    "",
    COMMON_RULES,
    "- 한국어로 1300자 이내. 표와 코드블록은 쓰지 마세요. 이모지는 쓰지 마세요.",
    "",
    "해석 초안:",
    draft || "(없음)",
    "",
    "감사 의견:",
    audit || "(없음)",
    "",
    "봇이 직접 계산한 통계 — 비율·신뢰구간·이상치는 이 값을 그대로 인용하세요:",
    "```json",
    JSON.stringify(stats),
    "```",
    "",
    "원본 데이터:",
    "```json",
    JSON.stringify(data),
    "```",
  ].join("\n");
}

// ── 주제 게이트 ─────────────────────────────────────────
//
// 이 방은 데이원디자인 마케팅만 다룬다. 아무 질문에나 답하기 시작하면 봇은 만능 비서가 되고,
// 광고 데이터와 무관한 답이 근거처럼 방에 남는다. 그래서 들어올 때 한 번 거른다.
// 분석기 프롬프트에도 같은 제한을 걸어 두었다 — 여기를 뚫려도 저기서 막힌다.

const OFF_TOPIC =
  /(서버|배포|코드|스크립트|리팩|깃허브|github|커밋|디비|데이터베이스|스키마|비밀번호|패스워드|토큰|시크릿|api\s*key|ssh|터미널|셸|쉘|명령어|실행해|설치해|삭제해|고쳐|수정해|파일\s*(열|읽|써|만들)|번역|날씨|주식|뉴스|맛집|일정|메일\s*보내|카톡\s*보내)/i;

const ON_TOPIC =
  /(광고|마케팅|유입|리드|접수|견적|문의|전환|캠페인|소재|예산|노출|클릭|성과|효율|단가|채널|출처|검색|키워드|방문|트래픽|이탈|메타|meta|페이스북|페북|인스타|instagram|facebook|ctr|cpc|cpm|cpl|roas|ga4|픽셀|타겟|타깃|광고세트|크리에이티브|브리프|비딩|입찰)/i;

function topicOf(text) {
  const t = String(text || "");
  if (OFF_TOPIC.test(t)) return "off";
  if (ON_TOPIC.test(t)) return "on";
  return "unclear";
}

// ── 명령 해석 ───────────────────────────────────────────
const HELP = [
  "데이원 마케팅효율봇",
  "",
  "이 방은 데이원디자인의 유입 분석과 Meta 광고 분석만 답합니다.",
  "그 밖의 주제(시스템·코드·계정·일반 질문)에는 응답하지 않습니다.",
  "",
  "· 그냥 물어보세요 — 클로드와 코덱스가 같은 데이터로 각각 답합니다.",
  "  예) 이번 달 광고 효율 어때? / 리드 단가 왜 올랐지? / 유입 채널별 접수 비교해줘",
  "",
  "· /brief [일수] — 기본 브리프 (기본 30일)",
  "· /data [일수] — 분석 없이 원본 숫자만",
  "· /ping — 봇·데이터 연결 확인",
].join("\n");

const OFF_TOPIC_REPLY = [
  "이 방은 데이원디자인의 유입·Meta 광고 분석만 답합니다.",
  "",
  "이렇게 물어봐 주세요.",
  "· 이번 달 광고 효율 어때?",
  "· 리드 단가가 왜 올랐지?",
  "· 유입 채널별로 접수 얼마나 나왔어?",
  "· /brief 7",
].join("\n");

function parseCommand(text) {
  const t = String(text || "").trim();
  if (!t) return null;

  const bare = t.replace(/@day1_mkteff_bot/gi, "").trim();

  if (/^\/(help|start)\b/i.test(bare)) return { kind: "help" };
  if (/^\/ping\b/i.test(bare)) return { kind: "ping" };

  const dataM = bare.match(/^\/data(?:\s+(\d+))?\s*$/i);
  if (dataM) return { kind: "data", days: Number(dataM[1] || 30) };

  const briefM = bare.match(/^\/brief(?:\s+(\d+))?\s*$/i);
  if (briefM) {
    return {
      kind: "analyze",
      days: Number(briefM[1] || 30),
      question:
        "최근 기간의 마케팅 효율을 브리핑해 주세요. 광고비 대비 접수 성과, " +
        "유입 경로별 기여, 눈에 띄는 변화와 그 원인을 짚어 주세요.",
    };
  }

  if (bare.startsWith("/")) return { kind: "unknown" };

  // 자유 질문 — 마케팅 범위인지 먼저 가른다.
  // 애매한 문장까지 통과시키면 분석기가 엉뚱한 주제에 광고 데이터를 갖다 붙인다
  if (topicOf(bare) !== "on") return { kind: "offtopic" };

  const days = Number((bare.match(/(\d+)\s*일/) || [])[1] || 30);
  return { kind: "analyze", days: Math.min(Math.max(days, 1), 180), question: bare };
}

function summarizeNumbers(d) {
  const eff = d.efficiency || {};
  const ads = d.ads?.summary || {};
  const leads = d.leads || {};
  const bySource = (leads.bySource || [])
    .slice(0, 6)
    .map((r) => `${r.source} ${r.n}`)
    .join(" · ");
  // 광고계정 통화가 USD 다. '원'으로 적으면 대표가 환산된 금액으로 읽는다
  const usd = (n) =>
    "$" + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  return [
    `기간 ${d.range?.since} ~ ${d.range?.until} (${d.range?.days}일)`,
    "",
    `광고비 ${usd(eff.spend)} · 노출 ${Number(ads.impressions || 0).toLocaleString()} · 클릭 ${Number(ads.clicks || 0).toLocaleString()}`,
    `접수 ${eff.leads || 0}건 · 리드단가 ${eff.costPerLead ? usd(eff.costPerLead) : "산출 불가"}`,
    bySource ? `접수 경로 ${bySource}` : "",
    d.traffic?.available === false ? "유입 데이터 없음" : "",
    d.ads?.available === false ? "광고 데이터 없음" : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ── 처리 ────────────────────────────────────────────────
let busy = false;

async function handle(msg) {
  const cmd = parseCommand(msg.text);
  if (!cmd) return;
  const replyTo = msg.message_id;

  if (cmd.kind === "help" || cmd.kind === "unknown") {
    await say(HELP, { replyTo });
    return;
  }

  if (cmd.kind === "offtopic") {
    log("범위 밖 질문 —", String(msg.text).slice(0, 40));
    await say(OFF_TOPIC_REPLY, { replyTo });
    return;
  }

  if (cmd.kind === "ping") {
    try {
      const d = await fetchBrief(7);
      await say(
        `봇 정상. 데이터 연결 정상.\n\n${summarizeNumbers(d)}`,
        { replyTo },
      );
    } catch (e) {
      await say(`봇은 살아 있지만 데이터를 못 읽습니다.\n${e.message}`, {
        replyTo,
      });
    }
    return;
  }

  if (cmd.kind === "data") {
    try {
      const d = await fetchBrief(cmd.days);
      await say(summarizeNumbers(d), { replyTo });
    } catch (e) {
      await say(`데이터를 못 읽었습니다.\n${e.message}`, { replyTo });
    }
    return;
  }

  if (busy) {
    await say("앞선 분석이 아직 돌고 있습니다. 끝나면 이어서 답하겠습니다.", {
      replyTo,
    });
    return;
  }

  busy = true;
  const startedAt = Date.now();
  try {
    let data;
    try {
      data = await fetchBrief(cmd.days);
    } catch (e) {
      await say(`데이터를 못 읽어 분석을 시작하지 못했습니다.\n${e.message}`, {
        replyTo,
      });
      return;
    }

    await say(
      `최근 ${cmd.days}일 데이터를 봅니다.\n\n${summarizeNumbers(data)}\n\n분석에 3~8분 걸립니다.`,
      { replyTo },
    );

    // 비율·신뢰구간·이상치는 여기서 확정한다. 모델에게 계산을 맡기면 검산할 때마다 어긋난다
    let stats;
    try {
      stats = analyze(data);
    } catch (e) {
      log("통계 계산 실패 —", e.message);
      stats = { error: "통계 계산에 실패했습니다", detail: String(e.message).slice(0, 120) };
    }

    // 1) 해석 초안
    const draftRes = await askClaude(interpretPrompt(cmd.question, data, stats));
    if (!draftRes.ok) log("해석 단계 실패 —", draftRes.error);

    // 2) 감사 — 초안이 없으면 데이터만 보고 점검한다
    const auditRes = await askCodex(
      auditPrompt(cmd.question, data, stats, draftRes.ok ? draftRes.out : ""),
    );
    if (!auditRes.ok) log("감사 단계 실패 —", auditRes.error);

    // 3) 종합 — 방에 나가는 것은 이것뿐이다
    let finalText = "";
    const finalRes = await askCodex(
      synthesizePrompt(
        cmd.question,
        data,
        stats,
        draftRes.ok ? draftRes.out : "",
        auditRes.ok ? auditRes.out : "",
      ),
    );
    if (finalRes.ok) finalText = finalRes.out;
    else if (draftRes.ok) {
      // 종합이 죽으면 해석 초안이라도 내보낸다. 침묵이 가장 나쁜 결과다
      log("종합 실패 — 해석 초안으로 대체", finalRes.error);
      finalText = draftRes.out;
    } else if (auditRes.ok) {
      finalText = auditRes.out;
    }

    const took = Math.round((Date.now() - startedAt) / 1000);
    if (finalText) {
      await say(finalText);
    } else {
      await say(
        "분석을 마치지 못했습니다. 잠시 뒤 다시 물어봐 주세요.\n" +
          `(${[draftRes.error, auditRes.error, finalRes.error].filter(Boolean)[0] || ""})`.slice(
            0,
            200,
          ),
      );
    }
    log(
      `분석 ${took}초 — 해석=${draftRes.ok} 감사=${auditRes.ok} 종합=${finalRes.ok}`,
    );
  } finally {
    busy = false;
  }
}

// ── 롱폴링 ──────────────────────────────────────────────
async function main() {
  if (!TOKEN || !CHAT_ID) {
    console.error("토큰 또는 chat_id 가 없습니다");
    process.exit(1);
  }
  if (!BRIEF_SECRET) {
    console.error("BRIEF_SECRET 이 없습니다");
    process.exit(1);
  }

  log(`시작 — chat=${CHAT_ID} codex=${CODEX_MODEL}`);
  let offset = readJson(OFFSET_FILE, { offset: 0 }).offset || 0;

  for (;;) {
    try {
      const r = await tg(
        "getUpdates",
        { offset, timeout: POLL_TIMEOUT_S, allowed_updates: ["message"] },
        (POLL_TIMEOUT_S + 20) * 1000,
      );
      if (!r.ok) {
        log("getUpdates 실패 —", r.description);
        await new Promise((s) => setTimeout(s, 5000));
        continue;
      }
      for (const u of r.result || []) {
        offset = u.update_id + 1;
        writeJson(OFFSET_FILE, { offset });
        const msg = u.message;
        if (!msg || String(msg.chat?.id) !== String(CHAT_ID)) continue;
        if (msg.from?.is_bot) continue;
        if (!msg.text) continue;
        handle(msg).catch((e) => log("처리 실패 —", e.message));
      }
    } catch (e) {
      log("폴링 오류 —", e.message);
      await new Promise((s) => setTimeout(s, 5000));
    }
  }
}

// 게이트가 실제로 무엇을 통과시키는지는 짐작하지 말고 돌려서 본다.
// 정규식은 눈으로 읽어서는 어디까지 걸리는지 알 수 없다.
function selftest() {
  const cases = [
    ["이번 달 광고 효율 어때?", "analyze"],
    ["리드 단가 왜 올랐지", "analyze"],
    ["유입 채널별 접수 비교해줘", "analyze"],
    ["최근 7일 캠페인 성과 보여줘", "analyze"],
    ["메타 광고 소재 중에 뭐가 제일 나아?", "analyze"],
    ["/brief", "analyze"],
    ["/brief 7", "analyze"],
    ["/ping", "ping"],
    ["/data 14", "data"],
    ["서버 재배포 해줘", "offtopic"],
    ["DB 비밀번호 알려줘", "offtopic"],
    ["이 파일 읽어줘", "offtopic"],
    ["오늘 날씨 어때?", "offtopic"],
    ["코드 고쳐줘", "offtopic"],
    ["안녕", "offtopic"],
    ["점심 뭐 먹지", "offtopic"],
  ];
  let bad = 0;
  for (const [text, expected] of cases) {
    const got = parseCommand(text)?.kind || "null";
    const ok = got === expected;
    if (!ok) bad++;
    console.log(`${ok ? "OK " : "실패"} ${JSON.stringify(text)} → ${got} (기대 ${expected})`);
  }
  console.log(bad === 0 ? "\n전부 통과" : `\n${bad}건 실패`);
  process.exit(bad === 0 ? 0 : 1);
}

if (process.argv.includes("--selftest")) selftest();
else main();
