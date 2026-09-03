// 매일 오전 10시, 전날 하루의 캠페인 집행 효율을 흰 바탕 이미지 한 장으로 만들어
// 마케팅효율봇 방에 올린다.
//
// 하루치만 보면 리드가 0인 캠페인이 대부분이라 판단이 어렵다. 그래서 어제를 주로
// 놓되 최근 7일을 나란히 실어 추세를 함께 본다.
//
// 사용법
//   node daily-report.mjs                 # 받아서 만들고 보낸다
//   node daily-report.mjs --no-send       # 이미지까지만 만든다
//   node daily-report.mjs --from-dir DIR  # DIR 의 brief_yday.json·brief_7d.json 을 쓴다
//
// 관련: README.md, bot.mjs(물어보면 답하는 쪽), F:\2026_BAS 의 meta-report(원형)

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const optOf = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : "";
};

const NO_SEND = flag("--no-send");
const FROM_DIR = optOf("--from-dir");
const OUT_DIR = optOf("--out") || path.join(HERE, "report");

/* ────────────────────────── 환경 ────────────────────────── */

function loadEnv(file) {
  const values = {};
  if (!fs.existsSync(file)) return values;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    values[m[1]] = v;
  }
  return values;
}

const envFile = process.env.DAY1_MKT_ENV_FILE || path.join(HERE, ".env");
const fileEnv = loadEnv(envFile);
const env = (k) => process.env[k] || fileEnv[k] || "";

/* ────────────────────────── 날짜 ────────────────────────── */

// 광고 집계는 KST 로 끊는다. 서버 시간대가 무엇이든 같은 날을 가리켜야 한다.
function kstDate(daysAgo = 0) {
  const now = new Date(Date.now() - daysAgo * 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function dowLabel(ymd) {
  const d = new Date(`${ymd}T12:00:00+09:00`);
  return "일월화수목금토"[d.getDay()];
}

/* ────────────────────────── 데이터 ────────────────────────── */

async function fetchBrief(query) {
  const base = env("BRIEF_API");
  const secret = env("BRIEF_SECRET");
  if (!base) throw new Error("BRIEF_API 가 없다");
  if (!secret) throw new Error("BRIEF_SECRET 이 없다");
  // day1design.co.kr/api/brief 는 Vercel 이 404 를 낸다. 워커가 받는 API 호스트로만 부른다
  const url = `${base.replace(/\/$/, "")}/api/brief/marketing?${query}`;
  const res = await fetch(url, { headers: { "X-Brief-Secret": secret } });
  if (!res.ok) throw new Error(`brief ${query} 응답 ${res.status}`);
  return res.json();
}

async function loadData(yday) {
  if (FROM_DIR) {
    const read = (f) =>
      JSON.parse(fs.readFileSync(path.join(FROM_DIR, f), "utf8"));
    return { day: read("brief_yday.json"), week: read("brief_7d.json") };
  }
  const [day, week] = await Promise.all([
    fetchBrief(`range=custom&start=${yday}&end=${yday}`),
    fetchBrief("range=7"),
  ]);
  return { day, week };
}

/* ────────────────────────── 표기 ────────────────────────── */

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );

const usd = (n) =>
  `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const int = (n) => Number(n || 0).toLocaleString("ko-KR");
const pct = (n) => `${(Number(n || 0) * 100).toFixed(2)}%`;

// 리드를 목표로 하지 않는 캠페인은 리드단가로 줄 세우면 안 된다
const isLeadGoal = (c) =>
  String(c.objective || "").toUpperCase() === "OUTCOME_LEADS";

// 캠페인마다 다음 손을 정해 준다. 목표 안에 들어오면 더 태우고, 목표를 크게
// 벗어나면 예산을 더 붓는 대신 소재를 새로 만든다.
//
// 판정을 7일로 하는 이유 — 하루치는 리드가 한두 건이라 단가가 두 배씩 튄다.
// 그 숫자로 증액·교체를 정하면 어제 운이 좋았던 캠페인에 돈을 더 넣게 된다.
// 리드가 3건도 안 쌓인 캠페인은 아직 판단하지 않는다.
function advise(c, target, mult) {
  const leads = Number(c.leads || 0);
  const spend = Number(c.spend || 0);
  const cpl = leads > 0 ? spend / leads : 0;

  if (leads === 0) {
    // 목표의 갑절을 쓰고도 한 건이 없으면 예산 문제가 아니라 소재 문제다
    if (spend > target * mult) {
      return { label: "신규 소재 권장", tone: "bad", why: `${usd(spend)} 쓰고 리드 0` };
    }
    return { label: "판단 보류", tone: "mute", why: "아직 표본이 적음" };
  }
  if (cpl > target * mult) {
    return {
      label: "신규 소재 권장",
      tone: "bad",
      why: `목표의 ${(cpl / target).toFixed(1)}배`,
    };
  }
  if (cpl <= target) {
    if (leads < 3) {
      return { label: "관찰", tone: "mute", why: "리드 3건 미만" };
    }
    return { label: "증액 권장", tone: "good", why: `목표 ${usd(target)} 이내` };
  }
  return {
    label: "유지·관찰",
    tone: "mute",
    why: `목표의 ${(cpl / target).toFixed(1)}배`,
  };
}

/* ────────────────────────── HTML ────────────────────────── */

function buildHtml({ yday, day, week }) {
  const dayAds = day.ads || {};
  const weekAds = week.ads || {};
  const dayCamps = [...(dayAds.campaigns || [])].sort(
    (a, b) => (b.spend || 0) - (a.spend || 0),
  );
  const weekCamps = [...(weekAds.campaigns || [])].sort(
    (a, b) => (b.spend || 0) - (a.spend || 0),
  );
  const s = dayAds.summary || {};

  // 붉게 칠하는 기준은 목표 단가다. 최근 7일 평균은 목표에서 얼마나 벌어져
  // 있는지 보여 주는 참고값으로만 아래에 적는다
  const target = Number(env("DAY1_TARGET_CPL") || 30);
  // 목표의 몇 배부터 소재를 갈아야 하는가
  const mult = Number(env("DAY1_CPL_ALERT_MULT") || 2);
  const leadCamps = weekCamps.filter(isLeadGoal);
  const wSpend = leadCamps.reduce((a, c) => a + (c.spend || 0), 0);
  const wLeads = leadCamps.reduce((a, c) => a + (c.leads || 0), 0);
  const weekAvg = wLeads > 0 ? wSpend / wLeads : 0;
  const dayCpl = s.leads > 0 ? s.spend / s.leads : 0;

  const leadRows = day.leads || {};
  const bySource = (leadRows.bySource || [])
    .map((r) => `${sourceLabel(r.source)} ${r.n}`)
    .join(" · ");

  const dayRows = dayCamps
    .map((c) => {
      const goal = isLeadGoal(c);
      const over = goal && c.leads > 0 && c.cpl > target;
      return `<tr class="${goal ? "" : "traffic"}">
        <td class="name">${esc(c.name)}${goal ? "" : '<span class="tag">트래픽</span>'}</td>
        <td class="num">${usd(c.spend)}</td>
        <td class="num">${int(c.impressions)}</td>
        <td class="num">${int(c.clicks)}</td>
        <td class="num">${pct(c.ctr)}</td>
        <td class="num">${goal ? int(c.leads) : '<span class="dash">—</span>'}</td>
        <td class="num cpl${over ? " over" : ""}">${
          goal && c.leads > 0
            ? usd(c.cpl) + (over ? '<span class="x">✕</span>' : "")
            : '<span class="dash">—</span>'
        }</td>
      </tr>`;
    })
    .join("");

  const weekLead = weekCamps.filter(isLeadGoal);
  const advices = weekLead.map((c) => advise(c, target, mult));
  const weekRows = weekLead
    .map((c, i) => {
      const over = c.leads > 0 && c.cpl > target;
      const a = advices[i];
      return `<tr>
        <td class="name">${esc(c.name)}</td>
        <td class="num">${usd(c.spend)}</td>
        <td class="num">${int(c.leads)}</td>
        <td class="num cpl${over ? " over" : ""}">${
          c.leads > 0
            ? usd(c.cpl) + (over ? '<span class="x">✕</span>' : "")
            : '<span class="dash">—</span>'
        }</td>
        <td class="act"><span class="pill ${a.tone}">${a.label}</span><em>${esc(a.why)}</em></td>
      </tr>`;
    })
    .join("");

  const boost = advices.filter((a) => a.tone === "good").length;
  const renew = advices.filter((a) => a.tone === "bad").length;
  const todo =
    boost || renew
      ? [
          boost ? `<b class="good">증액 대상 ${boost}건</b>` : "",
          renew ? `<b class="bad">신규 소재 필요 ${renew}건</b>` : "",
        ]
          .filter(Boolean)
          .join(" · ")
      : "지금 손댈 캠페인은 없습니다";

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Apple SD Gothic Neo','Malgun Gothic','맑은 고딕',sans-serif;
     background:#fff;color:#1f2937;width:1100px;padding:44px 48px;-webkit-font-smoothing:antialiased}
.title{font-size:36px;font-weight:800;color:#111827;letter-spacing:-1px}
.sub{font-size:16px;color:#111827;font-weight:500;margin-top:10px}
.cards{display:flex;gap:12px;margin-top:26px}
.card{flex:1;border:1px solid #e5e7eb;border-radius:12px;padding:16px 18px}
.card b{display:block;font-size:13px;color:#9ca3af;font-weight:600;letter-spacing:.3px}
.card span{display:block;font-size:28px;font-weight:800;color:#111827;margin-top:6px;
           font-variant-numeric:tabular-nums;letter-spacing:-.5px}
.card.accent{background:#faf8f4;border-color:#e8e2d6}
.card.accent.bad{background:#fef2f2;border-color:#fca5a5}
.card.accent.bad span{color:#dc2626}
.card b i{font-style:normal;font-weight:600;color:#c3c9d2;margin-left:5px}
h2{font-size:18px;font-weight:800;color:#111827;margin:34px 0 0}
h2 em{font-style:normal;font-size:14px;font-weight:600;color:#9ca3af;margin-left:8px}
table{width:100%;border-collapse:collapse;margin-top:14px}
thead th{font-size:14px;color:#9ca3af;font-weight:600;padding:0 6px 12px;border-bottom:2px solid #111827}
thead th.l{text-align:left}
thead th.r{text-align:right}
tbody td{padding:15px 6px;border-bottom:1px solid #f3f4f6;font-size:17px}
td.name{text-align:left;font-weight:700;color:#1f2937}
td.num{text-align:right;font-weight:700;color:#1f2937;font-variant-numeric:tabular-nums}
td.cpl.over{color:#ef4444;background:#fef2f2;border-radius:4px}
.x{color:#ef4444;font-weight:700;margin-left:6px}
.dash{color:#cbd1da}
tr.traffic td{background:#fafafa;color:#9ca3af}
tr.traffic td.name{color:#9ca3af}
tr.traffic td.num{color:#9ca3af}
.tag{font-size:12px;font-weight:700;color:#9ca3af;background:#f3f4f6;border-radius:5px;
     padding:2px 7px;margin-left:8px;vertical-align:middle}
.todo{margin-top:22px;padding:14px 18px;background:#f8fafc;border:1px solid #e5e7eb;
      border-radius:10px;font-size:16px;color:#111827;font-weight:600}
.todo b{font-weight:800;margin-right:4px}
.todo b.good{color:#15803d}
.todo b.bad{color:#dc2626}
td.act{text-align:left;padding-left:14px}
td.act em{font-style:normal;display:block;font-size:12.5px;color:#b6bdc8;margin-top:3px}
.act-h{padding-left:14px !important}
.pill{display:inline-block;font-size:13px;font-weight:800;border-radius:999px;padding:3px 10px}
.pill.good{background:#dcfce7;color:#15803d}
.pill.bad{background:#fee2e2;color:#dc2626}
.pill.mute{background:#f1f3f5;color:#8b95a3}
.foot{margin-top:26px;padding-top:18px;border-top:1px solid #e5e7eb;
      font-size:14px;color:#111827;line-height:1.75}
.foot b{color:#111827;font-weight:800}
.legend{display:inline-flex;align-items:center;gap:7px;margin-right:14px}
.legend .sq{width:14px;height:14px;border:2px solid #f87171;border-radius:4px;display:inline-block}
</style></head><body>
  <div class="title">데이원디자인 · 어제 광고 효율</div>
  <div class="sub">${yday}(${dowLabel(yday)}) 하루 · 단위 USD($) · 리드는 Meta 집계 기준 · 오늘 오전 10시 발송</div>

  <div class="cards">
    <div class="card"><b>지출</b><span>${usd(s.spend)}</span></div>
    <div class="card"><b>노출</b><span>${int(s.impressions)}</span></div>
    <div class="card"><b>클릭</b><span>${int(s.clicks)}</span></div>
    <div class="card"><b>Meta 리드</b><span>${int(s.leads)}</span></div>
    <div class="card accent${dayCpl > target ? " bad" : ""}">
      <b>리드단가 <i>목표 ${usd(target)}</i></b>
      <span>${s.leads > 0 ? usd(dayCpl) : "—"}</span>
    </div>
  </div>

  <div class="todo">오늘 할 일 &nbsp;${todo}</div>

  <h2>어제 캠페인별<em>지출 순</em></h2>
  <table>
    <thead><tr>
      <th class="l">캠페인</th><th class="r">지출</th><th class="r">노출</th>
      <th class="r">클릭</th><th class="r">CTR</th><th class="r">리드</th><th class="r">리드단가</th>
    </tr></thead>
    <tbody>${dayRows || '<tr><td colspan="7" class="dash" style="padding:20px 6px">집행된 캠페인이 없습니다</td></tr>'}</tbody>
  </table>

  <h2>최근 7일 잠재고객 캠페인<em>${week.range?.startDate || ""} ~ ${week.range?.endDate || ""} · 하루치는 흔들리므로 함께 본다</em></h2>
  <table>
    <thead><tr>
      <th class="l">캠페인</th><th class="r">지출</th><th class="r">리드</th>
      <th class="r">리드단가</th><th class="l act-h">다음 손</th>
    </tr></thead>
    <tbody>${weekRows || '<tr><td colspan="5" class="dash" style="padding:20px 6px">리드 캠페인이 없습니다</td></tr>'}</tbody>
  </table>

  <div class="foot">
    <span class="legend"><i class="sq"></i>목표 리드단가 ${usd(target)} 보다 비싼 칸</span>
    <br />
    어제 전체 접수 <b>${int(leadRows.total)}건</b>${bySource ? ` (${esc(bySource)})` : ""} —
    Meta 집계 리드와 D1 에 저장된 접수는 수가 다를 수 있습니다.<br />
    트래픽 캠페인은 리드를 목표로 하지 않아 리드단가 비교에서 뺐습니다.<br />
    <b>다음 손</b>은 7일 실적으로 정합니다 — 목표 ${usd(target)} 이내이고 리드가 3건 이상이면 <b>증액</b>,
    목표의 ${mult}배(${usd(target * mult)})를 넘으면 예산 대신 <b>새 소재</b>를 권합니다.
    리드가 3건에 못 미치면 아직 판단하지 않습니다.<br />
    최근 7일 잠재고객 캠페인 평균은 <b>${weekAvg > 0 ? usd(weekAvg) : "—"}</b>(${usd(wSpend)} ÷ ${int(wLeads)}건)로,
    목표 ${usd(target)} 대비 ${weekAvg > 0 ? `${(weekAvg / target).toFixed(1)}배` : "—"} 입니다.
  </div>
</body></html>`;
}

function sourceLabel(key) {
  const map = {
    meta: "Meta",
    homepage: "홈페이지",
    instagram_mkt: "인스타",
    naver: "네이버",
    google: "구글",
  };
  return map[key] || key;
}

/* ────────────────────────── 렌더 ────────────────────────── */

async function renderPng(htmlPath, pngPath) {
  const pwPath =
    process.env.DAY1_PLAYWRIGHT_PATH ||
    (process.platform === "darwin"
      ? "/Users/pola/jssystem-content-pipeline/node_modules/playwright"
      : "C:/Users/flame/AppData/Roaming/npm/node_modules/playwright");
  // ESM 의 import 는 디렉터리를 못 받는다. 전역 설치본을 가리키려면 require 로 연다
  const { chromium } = createRequire(import.meta.url)(pwPath);
  const chrome =
    process.env.CHROME_BIN ||
    (process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : "C:/Program Files/Google/Chrome/Application/chrome.exe");

  const browser = await chromium.launch({
    executablePath: chrome,
    headless: true,
    args: ["--no-sandbox", "--font-render-hinting=none"],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1100, height: 1400 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.locator("body").screenshot({ path: pngPath });
  await browser.close();
}

/* ────────────────────────── 전송 ────────────────────────── */

// 이 맥에서는 node 의 fetch 가 텔레그램 주소로 못 나간다 — IPv4 는 ETIMEDOUT,
// IPv6 는 EHOSTUNREACH 로 둘 다 막힌다(2026-09-03 실측). 같은 순간에도 curl 은
// 붙으므로 전송은 curl 에 맡긴다.
//
// 토큰을 명령행 인자에 두면 ps 에 그대로 뜬다. --config - 로 표준입력에 넘겨
// 인자에는 남기지 않는다.
// curl config 는 값을 큰따옴표로 감싸므로 역슬래시와 큰따옴표를 막아 준다
const cq = (v) => String(v).split("\\").join("\\\\").split('"').join('\\"');

function curlTelegram(method, lines) {
  const token = env("DAY1_MKT_BOT_TOKEN");
  const chatId = env("DAY1_MKT_CHAT_ID");
  if (!token) throw new Error("DAY1_MKT_BOT_TOKEN 이 없다");
  if (!chatId) throw new Error("DAY1_MKT_CHAT_ID 가 없다");
  const config = [
    `url = "https://api.telegram.org/bot${token}/${method}"`,
    `form = "chat_id=${cq(chatId)}"`,
    ...lines.map((l) => `form = "${l}"`),
    "silent",
    "max-time = 90",
  ].join("\n");

  return new Promise((resolve, reject) => {
    const cp = spawn("curl", ["--config", "-"], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    cp.stdout.on("data", (d) => (out += d));
    cp.stderr.on("data", (d) => (err += d));
    cp.on("error", reject);
    cp.on("close", (code) => {
      if (code !== 0) return reject(new Error(`curl 종료코드 ${code} ${err.trim()}`));
      try {
        resolve(JSON.parse(out));
      } catch {
        reject(new Error(`텔레그램 응답을 읽지 못했다: ${out.slice(0, 200)}`));
      }
    });
    cp.stdin.end(config);
  });
}

async function sendPhoto(pngPath, caption) {
  const res = await curlTelegram("sendPhoto", [
    `caption=${cq(caption.slice(0, 1000))}`,
    `photo=@${pngPath};type=image/png`,
  ]);
  if (!res.ok) throw new Error(`sendPhoto 실패: ${res.description || "알 수 없음"}`);
  return res.result?.message_id;
}

async function sendFailure(message) {
  await curlTelegram("sendMessage", [
    `text=${cq(`[day1design/daily-report] ${message}`.slice(0, 3900))}`,
  ]).catch(() => {});
}

/* ────────────────────────── 실행 ────────────────────────── */

async function main() {
  const yday = kstDate(1);
  const { day, week } = await loadData(yday);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = yday.replace(/-/g, "");
  const htmlPath = path.join(OUT_DIR, `daily-${stamp}.html`);
  const pngPath = path.join(OUT_DIR, `daily-${stamp}.png`);

  fs.writeFileSync(htmlPath, buildHtml({ yday, day, week }), "utf8");
  await renderPng(htmlPath, pngPath);

  const s = day.ads?.summary || {};
  const caption =
    `${yday}(${dowLabel(yday)}) 광고 효율 — ` +
    `지출 ${usd(s.spend)} · 노출 ${int(s.impressions)} · Meta 리드 ${int(s.leads)}` +
    (s.leads > 0
      ? ` · 리드단가 ${usd(s.spend / s.leads)}` +
        (s.spend / s.leads > Number(env("DAY1_TARGET_CPL") || 30)
          ? ` (목표 ${usd(Number(env("DAY1_TARGET_CPL") || 30))} 초과)`
          : " (목표 이내)")
      : "");

  let messageId = null;
  if (!NO_SEND) messageId = await sendPhoto(pngPath, caption);

  console.log(
    JSON.stringify({
      ok: true,
      date: yday,
      png: pngPath,
      campaigns: (day.ads?.campaigns || []).length,
      spend: s.spend,
      leads: s.leads,
      sent: !NO_SEND,
      messageId,
    }),
  );
}

main().catch(async (e) => {
  console.error(JSON.stringify({ ok: false, error: e.message }));
  if (!NO_SEND) await sendFailure(`리포트를 만들지 못했습니다 — ${e.message}`);
  process.exit(1);
});
