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

// ── 기간 해석 ───────────────────────────────────────────
//
// 사람은 "이번 주", "지난달"이라고 묻지 "30일"이라고 묻지 않는다.
// 숫자만 찾는 정규식을 쓰면 그런 말이 전부 기본값 30일로 떨어지는데, 그러면 봇이
// 못 알아들은 것이 아니라 "알아듣고 다른 기간을 본" 꼴이라 사람이 더 헷갈린다.
// 그래서 해석 결과를 라벨로 만들어 답의 첫 줄에 되돌려 준다.

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function mdLabel(a, b) {
  const f = (s) => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;
  return a === b ? f(a) : `${f(a)}~${f(b)}`;
}

// 이번 주의 시작(월요일). 일요일을 주의 시작으로 보는 달력도 있지만
// 영업 주간은 월요일에 시작한다
function mondayOf(d) {
  const x = new Date(d);
  const dow = x.getDay(); // 0=일
  const back = dow === 0 ? 6 : dow - 1;
  return addDays(x, -back);
}

export function parsePeriod(text) {
  const t = String(text || "");
  const now = new Date();
  const today = ymd(now);
  const yesterday = ymd(addDays(now, -1));

  const custom = (start, end, label) => ({
    query: `range=custom&start=${start}&end=${end}`,
    label: `${label}(${mdLabel(start, end)})`,
  });

  if (/오늘|금일/.test(t)) {
    return { query: "range=today", label: `오늘(${mdLabel(today, today)})` };
  }
  if (/어제|전일/.test(t)) {
    return custom(yesterday, yesterday, "어제");
  }
  if (/(지난|저번|전)\s*주/.test(t)) {
    const lastMon = addDays(mondayOf(now), -7);
    return custom(ymd(lastMon), ymd(addDays(lastMon, 6)), "지난주");
  }
  if (/(이번|금)\s*주|이번주|금주/.test(t)) {
    const mon = ymd(mondayOf(now));
    // 월요일에는 이번 주에 끝난 날이 아직 없다. 그럴 때는 오늘을 본다
    const end = mon > yesterday ? today : yesterday;
    return custom(mon, end, "이번 주");
  }
  if (/(지난|저번|전)\s*달|전월|지난달/.test(t)) {
    return { query: "range=prev-month", label: "지난달" };
  }
  if (/(이번|금)\s*달|이달|금월|이번달/.test(t)) {
    return { query: "range=cur-month", label: "이번 달" };
  }

  const weeks = t.match(/(\d+)\s*주/);
  if (weeks) {
    const d = Math.min(Number(weeks[1]) * 7, 180);
    return { query: `days=${d}`, label: `최근 ${weeks[1]}주(${d}일)` };
  }
  const months = t.match(/(\d+)\s*(개월|달)/);
  if (months) {
    const d = Math.min(Number(months[1]) * 30, 180);
    return { query: `days=${d}`, label: `최근 ${months[1]}개월(${d}일)` };
  }
  const days = t.match(/(\d+)\s*일/);
  if (days) {
    const d = Math.min(Math.max(Number(days[1]), 1), 180);
    return { query: `days=${d}`, label: `최근 ${d}일` };
  }
  if (/일주일|한\s*주/.test(t)) return { query: "days=7", label: "최근 7일" };
  if (/한\s*달|1개월/.test(t)) return { query: "days=30", label: "최근 30일" };

  return { query: "days=30", label: "최근 30일", isDefault: true };
}

// ── 의도 해석 ───────────────────────────────────────────
//
// 위 parsePeriod 는 정형 표현만 읽는다. 사람은 "요즘 어때", "추석 전후로 비교해줘",
// "8월 성과", "지난주랑 이번주 붙여서" 처럼 묻는다. 규칙을 아무리 늘려도 그 말들을
// 다 담을 수 없고, 못 읽으면 조용히 30일로 떨어져 "알아듣고 다른 기간을 본" 꼴이 된다.
//
// 그래서 기간과 초점은 모델이 읽는다. 대신 모델이 답을 지어낼 여지를 좁히려고
// 형식을 JSON 으로 못 박고, 파싱에 실패하면 규칙 파서로 되돌아간다.
// 규칙은 사라지지 않고 아래를 받치는 자리로 내려간 것이다.

function intentPrompt(question, todayStr, dowStr) {
  return [
    "다음 질문에서 '분석 기간'과 '무엇을 묻는지'를 뽑아 JSON 하나만 출력하세요.",
    "설명·인사·코드블록 없이 JSON 만 출력합니다.",
    "",
    `오늘은 ${todayStr}(${dowStr})입니다. 데이터는 어제까지 집계됩니다.`,
    `질문: ${JSON.stringify(question)}`,
    "",
    "형식:",
    '{"onTopic":true,"periods":[{"kind":"days","days":7,"label":"이번 주"}],"focus":"무엇을 묻는지 한 문장"}',
    "",
    "규칙:",
    "- onTopic 은 이 질문이 인테리어 시공사의 마케팅 성과(광고·유입·견적 접수)에 관한 것이면 true.",
    "  시스템·코드·계정·일반 상식·잡담이면 false.",
    '- periods 의 kind 는 "days" | "today" | "cur-month" | "prev-month" | "custom" 중 하나.',
    '  · kind:"days" 면 days 에 숫자(1~180).',
    '  · kind:"custom" 이면 start,end 를 "YYYY-MM-DD" 로.',
    "- 비교를 요청하면 periods 에 두 구간을 넣으세요(먼저 최신 구간, 다음 비교 구간).",
    "  비교가 아니면 하나만 넣습니다.",
    "- 기간을 말하지 않았으면 최근 30일로 보고 label 을 '최근 30일'로 하세요.",
    "- '이번 주'는 이번 주 월요일부터 어제까지, '지난주'는 지난 월요일부터 일요일까지입니다.",
    "- label 은 사람이 읽을 한국어 기간 이름입니다.",
    "- focus 는 질문이 실제로 알고 싶어 하는 것을 한 문장으로 적습니다.",
  ].join("\n");
}

function periodFromIntent(p) {
  if (!p || typeof p !== "object") return null;
  const label = String(p.label || "").slice(0, 40);
  const kind = String(p.kind || "");
  const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

  if (kind === "today") return { query: "range=today", label: label || "오늘" };
  if (kind === "cur-month")
    return { query: "range=cur-month", label: label || "이번 달" };
  if (kind === "prev-month")
    return { query: "range=prev-month", label: label || "지난달" };
  if (kind === "custom" && isDate(p.start) && isDate(p.end) && p.start <= p.end) {
    return {
      query: `range=custom&start=${p.start}&end=${p.end}`,
      label: `${label || "지정 기간"}(${mdLabel(p.start, p.end)})`,
    };
  }
  const n = Number(p.days);
  if (Number.isFinite(n) && n >= 1) {
    const d = Math.min(Math.round(n), 180);
    return { query: `days=${d}`, label: label || `최근 ${d}일` };
  }
  return null;
}

function extractJson(raw) {
  const s = String(raw || "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

async function interpretIntent(question) {
  const now = new Date();
  const fallback = {
    periods: [parsePeriod(question)],
    focus: "",
    onTopic: null,
    source: "규칙",
  };

  const r = await askClaude(
    intentPrompt(question, ymd(now), DOW[now.getDay()]),
    90 * 1000,
  );
  if (!r.ok) {
    log("의도 해석 실패, 규칙으로 대체 —", r.error);
    return fallback;
  }

  const parsed = extractJson(r.out);
  if (!parsed) {
    log("의도 해석 결과가 JSON 이 아니라 규칙으로 대체");
    return fallback;
  }

  const periods = (Array.isArray(parsed.periods) ? parsed.periods : [])
    .map(periodFromIntent)
    .filter(Boolean)
    .slice(0, 2);

  if (!periods.length) return { ...fallback, onTopic: parsed.onTopic };

  return {
    periods,
    focus: String(parsed.focus || "").slice(0, 200),
    onTopic: parsed.onTopic === false ? false : true,
    source: "해석",
  };
}

// ── 데이터 수집 ─────────────────────────────────────────
async function fetchBrief(period) {
  const query = typeof period === "string" ? period : period.query;
  const url = `${BRIEF_API}/api/brief/marketing?${query}`;
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


// 분석 한 번을 통째로 남긴다.
//
// 텔레그램 방에만 남기면 "그때 무슨 숫자를 보고 그렇게 말했나" 를 되짚을 수 없다.
// 광고 데이터는 계속 갱신되므로 같은 기간을 다시 조회해도 그때 본 값이 아니다.
// 스냅샷과 보고는 R2 에 원문으로, 검색에 쓸 값만 D1 에 남는다.
async function saveRun(payload) {
  try {
    const res = await fetch(`${BRIEF_API}/api/brief/runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Brief-Secret": BRIEF_SECRET,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000),
    });
    const j = await res.json();
    if (!j.ok) log("이력 저장 실패 —", j.error || res.status);
    return j;
  } catch (e) {
    // 이력을 못 남겨도 사람에게는 이미 답이 갔다. 여기서 흐름을 끊지 않는다
    log("이력 저장 실패 —", e.message);
    return null;
  }
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

async function askClaude(prompt, timeoutMs = ANALYZE_TIMEOUT_MS) {
  const r = await run(CLAUDE_BIN, ["-p", ...CLAUDE_NO_TOOLS], prompt, timeoutMs);
  if (!r.ok) return r;
  // 인증이 끊기면 CLI 가 성공 종료하면서 안내문만 뱉는다. 그걸 분석 결과로 올리면 안 된다
  if (/OAuth session expired|Please run .*login|Invalid API key/i.test(r.out)) {
    return { ok: false, out: "", error: "클로드 로그인이 만료됐습니다" };
  }
  return r;
}

async function askCodex(prompt, timeoutMs = ANALYZE_TIMEOUT_MS) {
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
    timeoutMs,
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
  "- costPerLead 는 전체 접수 기준입니다. Meta 광고만의 효율은",
  "  stats.leads.metaCostPerLead 를 쓰고, 그 기준이라고 밝히세요.",
  "- leads.byStatus 는 아직 운영에서 쓰지 않는 항목이라 거의 전부 '접수대기'입니다.",
  "  이것으로 상담·계약 전환을 논하거나 '데이터가 비어 있다'고 지적하지 마세요.",
].join("\n");

function interpretPrompt(question, data, stats) {
  return [
    "당신은 데이원디자인의 마케팅 성과 분석가입니다. 아래는 실제 운영 데이터입니다.",
    "",
    "요청: " + question,
    "",
    "이 단계에서 할 일은 '해석 초안'입니다. 최종 보고서가 아닙니다.",
    "- 먼저 stats.funnel 을 보세요. 지출·노출·클릭·접수가 각각 몇 배가 됐는지,",
    "  어느 단계에서 따라오지 못했는지가 이 기간의 이야기입니다. 그 흐름을 한 문장으로",
    "  요약하고 시작하세요.",
    "- stats.video 가 있으면 영상 소재가 첫 구간을 넘기는지 보세요. 재생 대비 25% 지점",
    "  도달률(hookRate)이 낮으면 예산이 아니라 앞 3초를 고쳐야 합니다. 여러 편이 모두",
    "  같은 자리에서 꺾이면 소재 하나가 아니라 만드는 방식의 문제입니다.",
    "  첫 구간을 못 넘기는데도 접수가 나오는 소재(weakButConverting)는 끄지 말고",
    "  앞부분만 바꾸라고 쓰세요.",
    "- 그다음 stats.campaigns 를 보세요. 캠페인마다 실제 접수가 붙어 있어 캠페인별",
    "  리드 단가가 나옵니다. 총계만 보면 '광고가 잘 되나'까지만 말할 수 있고,",
    "  돈을 어디로 옮길지는 이 표에서 나옵니다. 지출이 있는데 접수가 0건인 캠페인",
    "  (zeroLeadSpenders)이 있으면 반드시 짚으세요.",
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
    "가장 중요한 것 — 읽고 나서 한 문장이 남아야 합니다.",
    "숫자를 늘어놓은 보고는 읽는 사람이 스스로 이야기를 만들어야 합니다. 그 일을",
    "당신이 대신 해 주세요. 광고는 언제나 같은 순서로 흐릅니다. 돈을 쓰면 노출이 되고,",
    "노출에서 클릭이 나오고, 클릭에서 접수가 됩니다. 그 흐름의 어디까지 갔고 어디서",
    "멈췄는지가 이 기간의 이야기입니다. stats.funnel 이 그 배율과 병목을 담고 있으니",
    "거기서 출발하세요.",
    "",
    "형식:",
    "1) 핵심 메시지 — 한 문장. 이 기간 광고가 어떤 상태인지 판단합니다.",
    "   숫자 나열이 아니라 판단이어야 합니다. 예를 들어 '노출은 세 배로 샀는데 접수는",
    "   제자리다. 지금은 예산을 더 넣을 자리가 아니라 도착 지점을 고칠 자리다' 처럼",
    "   무엇이 일어났고 그래서 무엇을 해야 하는지가 한 문장에 들어가야 합니다.",
    "2) 흐름 — 지출 x배 → 노출 x배 → 클릭 x배 → 접수 x배 를 한 줄로 보여주고,",
    "   어느 단계에서 꺾였는지 짚으세요. 직전 구간이 없으면 이 줄은 생략합니다.",
    "3) 핵심 숫자 3개 — 광고비·접수·Meta 단독 리드단가.",
    "   캠페인별 단가 격차가 있으면 최저와 최고를 캠페인 이름과 함께 한 줄 더 적으세요.",
    "4) 지금 할 것 — 가장 중요한 하나를 먼저 쓰고, 필요하면 둘까지 더합니다.",
    "   캠페인 이름과 금액을 넣어 구체적으로 쓰세요. '소재를 개선한다' 같은 말은",
    "   실행할 수 없습니다. stats.campaigns 의 단가 격차와 접수 0건 캠페인이",
    "   가장 먼저 손댈 자리입니다.",
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
  "· 그냥 물어보세요. 기간은 말하는 대로 알아듣습니다.",
  "  예) 이번 주 광고 효율 어때? / 지난달 리드 단가 왜 올랐지?",
  "      지난주랑 이번 주 비교해줘 / 8월 유입 채널별 접수 보여줘",
  "",
  "· /brief [기간] — 기본 브리프. 기간을 안 쓰면 최근 30일",
  "  예) /brief 이번주 · /brief 지난달 · /brief 14",
  "· /data [기간] — 분석 없이 원본 숫자만",
  "· /ping — 봇·데이터 연결 확인",
  "",
  "기간을 어떻게 읽었는지 분석 시작할 때 먼저 알려드립니다.",
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

  // /brief 와 /data 는 뒤에 무엇이든 붙일 수 있다. "7" 도 되고 "이번주" 도 된다
  const dataM = bare.match(/^\/data\b\s*(.*)$/i);
  if (dataM) return { kind: "data", periodText: dataM[1].trim() };

  const briefM = bare.match(/^\/brief\b\s*(.*)$/i);
  if (briefM) {
    const extra = briefM[1].trim();
    return {
      kind: "analyze",
      periodText: extra,
      question:
        (extra ? `${extra} 기준으로 ` : "") +
        "마케팅 효율을 브리핑해 주세요. 광고비 대비 접수 성과, " +
        "유입 경로별 기여, 눈에 띄는 변화와 그 원인을 짚어 주세요.",
    };
  }

  if (bare.startsWith("/")) return { kind: "unknown" };

  // 자유 질문. 명백히 범위 밖인 것만 여기서 끊는다.
  //
  // 예전에는 마케팅 낱말이 안 보이면 전부 막았는데, 그러면 "요즘 어때?"나
  // "지난주랑 붙여서 봐줘" 같은 맥락 질문까지 안내문만 받고 끝났다. 낱말이 아니라
  // 맥락으로 판단해야 하는 몫은 의도 해석 단계로 넘기고, 여기서는 위험한 요청
  // (시스템·코드·계정)만 차단한다.
  if (topicOf(bare) === "off") return { kind: "offtopic" };

  return { kind: "analyze", question: bare };
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
  // 기간은 워커가 확정해 내려준다. 필드 이름을 바꿀 때 여기를 같이 안 고치면
  // "기간 undefined ~ undefined" 가 그대로 방에 올라간다(실제로 그렇게 나갔다)
  const r = d.range || {};
  const period =
    r.startDate && r.endDate
      ? `기간 ${r.startDate} ~ ${r.endDate}${r.days ? ` (${r.days}일)` : ""}`
      : "기간 정보를 받지 못했습니다";

  return [
    period,
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
      const d = await fetchBrief({ query: "days=7", label: "최근 7일" });
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
      const period = parsePeriod(cmd.periodText || "");
      const d = await fetchBrief(period);
      await say(`${period.label}

${summarizeNumbers(d)}`, { replyTo });
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
    // 1) 무엇을 언제 기준으로 묻는지부터 읽는다.
    //    이걸 건너뛰고 숫자만 찾으면 "이번 주"가 조용히 30일로 바뀐다
    const intent = await interpretIntent(
      cmd.periodText ? `${cmd.periodText} ${cmd.question}` : cmd.question,
    );

    if (intent.onTopic === false) {
      log("범위 밖(해석 단계) —", String(cmd.question).slice(0, 40));
      await say(OFF_TOPIC_REPLY, { replyTo });
      return;
    }

    const periods = intent.periods;
    const main = periods[0];
    const compare = periods[1] || null;

    let data;
    let compareData = null;
    try {
      data = await fetchBrief(main);
      if (compare) compareData = await fetchBrief(compare);
    } catch (e) {
      await say(`데이터를 못 읽어 분석을 시작하지 못했습니다.
${e.message}`, {
        replyTo,
      });
      return;
    }

    // 해석한 기간을 먼저 되돌려 준다. 사람이 "다른 기간을 봤다"는 것을
    // 결과를 다 읽고 나서야 알아채면 그 시간이 통째로 버려진다
    const head = compare
      ? `${main.label} vs ${compare.label} 로 봅니다.`
      : `${main.label} 기준으로 봅니다.`;
    await say(
      `${head}

${summarizeNumbers(data)}

분석에 2~5분 걸립니다.`,
      { replyTo },
    );

    // 비율·신뢰구간·이상치는 여기서 확정한다. 모델에게 계산을 맡기면 검산할 때마다 어긋난다
    const calc = (d) => {
      try {
        return analyze(d);
      } catch (e) {
        log("통계 계산 실패 —", e.message);
        return {
          error: "통계 계산에 실패했습니다",
          detail: String(e.message).slice(0, 120),
        };
      }
    };
    const stats = calc(data);
    const compareStats = compareData ? calc(compareData) : null;

    const bundle = compareData
      ? {
          기준구간: { label: main.label, data, stats },
          비교구간: { label: compare.label, data: compareData, stats: compareStats },
        }
      : null;

    // 질문에 초점이 잡혀 있으면 그것을 앞세운다. 없으면 원 질문 그대로 간다
    const ask = intent.focus
      ? `${cmd.question}
(초점: ${intent.focus} / 기간: ${main.label}${compare ? ` vs ${compare.label}` : ""})`
      : `${cmd.question}
(기간: ${main.label}${compare ? ` vs ${compare.label}` : ""})`;

    // 2) 해석 초안
    const draftRes = await askClaude(
      interpretPrompt(ask, bundle || data, stats),
    );
    if (!draftRes.ok) log("해석 단계 실패 —", draftRes.error);

    // 3) 감사 — 초안이 없으면 데이터만 보고 점검한다
    const auditRes = await askCodex(
      auditPrompt(ask, bundle || data, stats, draftRes.ok ? draftRes.out : ""),
    );
    if (!auditRes.ok) log("감사 단계 실패 —", auditRes.error);

    // 4) 종합 — 방에 나가는 것은 이것뿐이다
    let finalText = "";
    const finalRes = await askCodex(
      synthesizePrompt(
        ask,
        bundle || data,
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
      const why = String(
        [draftRes.error, auditRes.error, finalRes.error].filter(Boolean)[0] ||
          "원인 미상",
      ).slice(0, 200);
      await say(`분석을 마치지 못했습니다. 잠시 뒤 다시 물어봐 주세요.\n(${why})`);
    }
    // 이 분석이 무엇을 보고 무엇이라 답했는지 통째로 남긴다
    await saveRun({
      question: cmd.question,
      periodLabel: compare ? `${main.label} vs ${compare.label}` : main.label,
      startDate: data?.range?.startDate || "",
      endDate: data?.range?.endDate || "",
      spend: stats?.rates?.spend ?? data?.efficiency?.spend ?? 0,
      leads: stats?.leads?.total ?? 0,
      metaLeads: stats?.leads?.metaLeads ?? 0,
      metaCostPerLead: stats?.leads?.metaCostPerLead ?? 0,
      hookRateAvg: stats?.video?.avgHookRate ?? 0,
      bottleneck: stats?.funnel?.bottleneck
        ? `${stats.funnel.bottleneck.from}→${stats.funnel.bottleneck.at}`
        : "",
      verdict: stats?.funnel?.verdict || "",
      durationSec: took,
      stages: `해석=${draftRes.ok} 감사=${auditRes.ok} 종합=${finalRes.ok}`,
      status: finalText ? "success" : "failed",
      report: finalText || "",
      snapshot: { intent, stats, data, compare: compareData || null },
    });

    log(
      `분석 ${took}초 — 기간=${main.label}${compare ? "+" + compare.label : ""} 해석기간출처=${intent.source} 해석=${draftRes.ok} 감사=${auditRes.ok} 종합=${finalRes.ok}`,
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
  // 입구 게이트는 위험한 요청만 끊는다. 잡담은 여기서 통과하되 의도 해석이 걸러낸다 —
  // 그 몫을 여기로 끌어오면 "요즘 어때?" 같은 맥락 질문까지 같이 막힌다
  const cases = [
    ["이번 달 광고 효율 어때?", "analyze"],
    ["리드 단가 왜 올랐지", "analyze"],
    ["유입 채널별 접수 비교해줘", "analyze"],
    ["최근 7일 캠페인 성과 보여줘", "analyze"],
    ["메타 광고 소재 중에 뭐가 제일 나아?", "analyze"],
    ["요즘 어때?", "analyze"], // 낱말은 없지만 맥락 질문이다
    ["지난주랑 이번주 붙여서 봐줘", "analyze"],
    ["/brief", "analyze"],
    ["/brief 7", "analyze"],
    ["/brief 이번주", "analyze"],
    ["/ping", "ping"],
    ["/data 14", "data"],
    ["/data 지난달", "data"],
    ["서버 재배포 해줘", "offtopic"],
    ["DB 비밀번호 알려줘", "offtopic"],
    ["이 파일 읽어줘", "offtopic"],
    ["오늘 날씨 어때?", "offtopic"],
    ["코드 고쳐줘", "offtopic"],
  ];
  let bad = 0;
  for (const [text, expected] of cases) {
    const got = parseCommand(text)?.kind || "null";
    const ok = got === expected;
    if (!ok) bad++;
    console.log(
      `${ok ? "OK " : "실패"} ${JSON.stringify(text)} → ${got} (기대 ${expected})`,
    );
  }

  // 규칙 파서는 의도 해석이 죽었을 때 받치는 자리다. 그 자리가 비면
  // 모든 질문이 조용히 30일로 떨어지므로 여기서 함께 확인한다
  console.log("\n[기간 규칙 파서]");
  const now = new Date();
  const mon = ymd(mondayOf(now));
  const lastMon = ymd(addDays(mondayOf(now), -7));
  const periodCases = [
    ["이번주 광고 어때", `start=${mon}`],
    ["이번 주 성과", `start=${mon}`],
    ["지난주 접수", `start=${lastMon}`],
    ["지난달 광고비", "range=prev-month"],
    ["이번달 유입", "range=cur-month"],
    ["오늘 접수", "range=today"],
    ["최근 14일 성과", "days=14"],
    ["2주간 광고", "days=14"],
    ["3개월 추이", "days=90"],
    ["광고 어때", "days=30"],
  ];
  for (const [text, expected] of periodCases) {
    const got = parsePeriod(text);
    const ok = got.query.includes(expected);
    if (!ok) bad++;
    console.log(
      `${ok ? "OK " : "실패"} ${JSON.stringify(text)} → ${got.query} · ${got.label}`,
    );
  }

  console.log(bad === 0 ? "\n전부 통과" : `\n${bad}건 실패`);
  process.exit(bad === 0 ? 0 : 1);
}

if (process.argv.includes("--selftest")) selftest();
else main();
