// 접수자 방문 정보 — 30일 방문 횟수·재방문 여부·기기.
//
// 방문 횟수는 자체 트래커(site/js/tracker.js)가 브라우저에 30일 동안 보관하는 방문자 ID
// (_d1_hm_sid) 기준이다. ID 는 방문할 때마다 30일이 다시 연장되고, 마지막 방문에서 30일이
// 지나면 새로 발급된다. 같은 ID 의 최근 30일 page_view 를 30분 공백 기준으로 묶어 방문으로 센다
// (estimates.js 의 first-touch 방문 경계와 같은 기준).
//
// 기기 이름은 User-Agent 로만 읽는다. 인스타그램·페이스북 앱 브라우저는 UA 에 기종 코드를
// 싣는다(예: "Instagram … (iPhone15,2; iOS 26_6; …)", "FBDV/iPhone15,2", "SM-S918N").
// 일반 크롬·사파리는 기종을 숨기므로 "모델 미표시"로 남는다.

export const VISIT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const VISIT_GAP_MS = 30 * 60 * 1000;
// 사람 한 명이 30일 동안 남기는 page_view 는 수십 건이다. 상한은 폭주 방지용.
const VISIT_ROW_LIMIT = 2000;

// createdAtList: ISO 시각 목록(순서 무관). 이번 방문이 아직 기록되지 않았으면
// (트래커 전송 전에 접수) 이번 방문을 1회로 더한다 — 지금 접수한 방문은 항상 센다.
export function countVisits(createdAtList, nowMs = Date.now()) {
  const ts = (Array.isArray(createdAtList) ? createdAtList : [])
    .map((v) => Date.parse(v || ""))
    .filter(
      (t) =>
        Number.isFinite(t) &&
        t >= nowMs - VISIT_WINDOW_MS &&
        t <= nowMs + 60_000,
    )
    .sort((a, b) => a - b);
  let visits = 0;
  let prev = null;
  for (const t of ts) {
    if (prev === null || t - prev > VISIT_GAP_MS) visits++;
    prev = t;
  }
  if (prev === null || nowMs - prev > VISIT_GAP_MS) visits++;
  return {
    visitCount: visits,
    isRevisit: visits >= 2,
    firstVisitAt: new Date(ts.length ? ts[0] : nowMs).toISOString(),
  };
}

// known=false 는 방문자 ID 가 없거나(트래커 차단·저장소 막힘) 조회가 실패한 경우다.
export async function fetchVisitStats(env, sessionId, nowMs = Date.now()) {
  const empty = {
    visitCount: 0,
    isRevisit: false,
    firstVisitAt: "",
    known: false,
  };
  if (!sessionId || !env?.DB) return empty;
  try {
    const since = new Date(nowMs - VISIT_WINDOW_MS).toISOString();
    // idx_heatmap_session_created(SessionId, CreatedAt) 를 탄다.
    const res = await env.DB.prepare(
      `SELECT CreatedAt FROM HeatmapEvents
       WHERE SessionId = ? AND CreatedAt >= ? AND EventType = 'page_view'
       ORDER BY CreatedAt DESC
       LIMIT ${VISIT_ROW_LIMIT}`,
    )
      .bind(sessionId, since)
      .all();
    const rows = res?.results || [];
    return {
      ...countVisits(
        rows.map((r) => r.CreatedAt),
        nowMs,
      ),
      known: true,
    };
  } catch {
    return empty;
  }
}

function formatKstDate(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  const kst = new Date(t + 9 * 60 * 60 * 1000);
  return `${kst.getUTCMonth() + 1}/${kst.getUTCDate()}`;
}

// "3회 (재방문 · 첫 방문 10/28)" / "1회 (첫 방문)" / "확인 불가 (방문 기록 없음)"
export function formatVisitLine(stats) {
  if (!stats?.known || !stats.visitCount) return "확인 불가 (방문 기록 없음)";
  if (!stats.isRevisit) return `${stats.visitCount}회 (첫 방문)`;
  const first = formatKstDate(stats.firstVisitAt);
  return `${stats.visitCount}회 (재방문${first ? ` · 첫 방문 ${first}` : ""})`;
}

// ─── 기기 ──────────────────────────────────────────────

const IPHONE_MODELS = {
  "iPhone10,1": "iPhone 8",
  "iPhone10,4": "iPhone 8",
  "iPhone10,2": "iPhone 8 Plus",
  "iPhone10,5": "iPhone 8 Plus",
  "iPhone10,3": "iPhone X",
  "iPhone10,6": "iPhone X",
  "iPhone11,2": "iPhone XS",
  "iPhone11,4": "iPhone XS Max",
  "iPhone11,6": "iPhone XS Max",
  "iPhone11,8": "iPhone XR",
  "iPhone12,1": "iPhone 11",
  "iPhone12,3": "iPhone 11 Pro",
  "iPhone12,5": "iPhone 11 Pro Max",
  "iPhone12,8": "iPhone SE (2세대)",
  "iPhone13,1": "iPhone 12 mini",
  "iPhone13,2": "iPhone 12",
  "iPhone13,3": "iPhone 12 Pro",
  "iPhone13,4": "iPhone 12 Pro Max",
  "iPhone14,4": "iPhone 13 mini",
  "iPhone14,5": "iPhone 13",
  "iPhone14,2": "iPhone 13 Pro",
  "iPhone14,3": "iPhone 13 Pro Max",
  "iPhone14,6": "iPhone SE (3세대)",
  "iPhone14,7": "iPhone 14",
  "iPhone14,8": "iPhone 14 Plus",
  "iPhone15,2": "iPhone 14 Pro",
  "iPhone15,3": "iPhone 14 Pro Max",
  "iPhone15,4": "iPhone 15",
  "iPhone15,5": "iPhone 15 Plus",
  "iPhone16,1": "iPhone 15 Pro",
  "iPhone16,2": "iPhone 15 Pro Max",
  "iPhone17,1": "iPhone 16 Pro",
  "iPhone17,2": "iPhone 16 Pro Max",
  "iPhone17,3": "iPhone 16",
  "iPhone17,4": "iPhone 16 Plus",
  "iPhone17,5": "iPhone 16e",
  "iPhone18,1": "iPhone 17 Pro",
  "iPhone18,2": "iPhone 17 Pro Max",
  "iPhone18,3": "iPhone 17",
  "iPhone18,4": "iPhone Air",
  "iPhone18,5": "iPhone 17e",
};

// 삼성 모델 코드 앞 4자리(지역 접미사 N·B·U 등 제외) → 제품명.
const GALAXY_MODELS = {
  G981: "S20",
  G986: "S20+",
  G988: "S20 Ultra",
  G991: "S21",
  G996: "S21+",
  G998: "S21 Ultra",
  G990: "S21 FE",
  S901: "S22",
  S906: "S22+",
  S908: "S22 Ultra",
  S911: "S23",
  S916: "S23+",
  S918: "S23 Ultra",
  S711: "S23 FE",
  S921: "S24",
  S926: "S24+",
  S928: "S24 Ultra",
  S721: "S24 FE",
  S931: "S25",
  S936: "S25+",
  S938: "S25 Ultra",
  S937: "S25 Edge",
  S942: "S26",
  S947: "S26+",
  S948: "S26 Ultra",
  N971: "Note10",
  N976: "Note10+",
  N981: "Note20",
  N986: "Note20 Ultra",
  F711: "Z Flip3",
  F721: "Z Flip4",
  F731: "Z Flip5",
  F741: "Z Flip6",
  F761: "Z Flip7 FE",
  F766: "Z Flip7",
  F926: "Z Fold3",
  F936: "Z Fold4",
  F946: "Z Fold5",
  F956: "Z Fold6",
  F966: "Z Fold7",
  A155: "A15",
  A156: "A15",
  A165: "A16",
  A166: "A16",
  A256: "A25",
  A346: "A34",
  A356: "A35",
  A366: "A36",
  A536: "A53",
  A546: "A54",
  A556: "A55",
  A566: "A56",
};

// UA 축소(크롬 110+)로 기종 자리에 들어가는 가짜 값.
const HIDDEN_ANDROID_MODELS = new Set(["K", "WV", "MOBILE", "U", ""]);

function cleanToken(value, max = 40) {
  return String(value || "")
    .replace(/[^\w ,.+()\-가-힣]/g, "")
    .trim()
    .slice(0, max);
}

function detectApp(ua) {
  if (/Instagram \d/.test(ua)) return "인스타그램 앱";
  if (/FBAN\/|FBAV\/|FB_IAB|FBIOS/.test(ua)) return "페이스북 앱";
  if (/KAKAOTALK/i.test(ua)) return "카카오톡";
  if (/NAVER\(inapp|NAVER\//.test(ua)) return "네이버 앱";
  if (/DaumApps/.test(ua)) return "다음 앱";
  if (/ Line\//.test(ua)) return "라인";
  if (/SamsungBrowser\//.test(ua)) return "삼성 인터넷";
  if (/Whale\//.test(ua)) return "웨일";
  if (/EdgiOS\/|EdgA\/|Edg\//.test(ua)) return "Edge";
  if (/FxiOS\/|Firefox\//.test(ua)) return "Firefox";
  if (/CriOS\/|Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "";
}

function detectOs(ua) {
  let m = ua.match(/(?:iPhone OS|CPU OS|iOS) (\d+)[_.](\d+)/);
  if (m) return `iOS ${m[1]}.${m[2]}`;
  m = ua.match(/Android (\d+(?:\.\d+)?)/);
  if (m) return `Android ${m[1]}`;
  if (/Windows NT/.test(ua)) return "Windows";
  if (/Mac OS X/.test(ua)) return "macOS";
  return "";
}

function galaxyName(code) {
  const m = code.match(/^SM-([A-Z]\d{3})/i);
  if (!m) return "";
  const name = GALAXY_MODELS[m[1].toUpperCase()];
  return name ? `갤럭시 ${name} (${code})` : `삼성 ${code}`;
}

function detectModel(ua) {
  const ios = ua.match(/\b(iPhone\d+,\d+|iPad\d+,\d+)\b/);
  if (ios) return IPHONE_MODELS[ios[1]] || ios[1];
  if (/iPhone/.test(ua)) return "iPhone (모델 미표시)";
  if (/iPad/.test(ua)) return "iPad";

  if (/Android/.test(ua)) {
    // 인스타그램 앱: "Android (34/14; 450dpi; 1080x2316; samsung; SM-S918N; dm3q; …)"
    const ig = ua.match(
      /Android \(\d+\/[\d.]+; [^;]*; [^;]*; ([^;]+); ([^;]+);/,
    );
    // 브라우저 공통: "Linux; Android 14; SM-S918N Build/…)" 또는 "…; SAMSUNG SM-S918N)"
    const linux = ua.match(
      /Android [\d.]+;(?: [a-z]{2}[-_][a-z]{2};)? ([^;)]+?)(?: Build\/[^;)]*)?(?:;|\))/i,
    );
    const raw = cleanToken(ig ? ig[2] : linux ? linux[1] : "").replace(
      /^SAMSUNG\s+/i,
      "",
    );
    if (HIDDEN_ANDROID_MODELS.has(raw.toUpperCase())) {
      return "Android 폰 (모델 미표시)";
    }
    const galaxy = galaxyName(raw);
    if (galaxy) return galaxy;
    // "Google/google" 처럼 제조사·브랜드가 붙어 오는 경우 앞쪽만 쓴다.
    const maker = ig ? cleanToken(ig[1].split("/")[0], 20) : "";
    return maker && !raw.toLowerCase().startsWith(maker.toLowerCase())
      ? `${maker} ${raw}`
      : raw;
  }
  if (/Windows NT|Macintosh|X11/.test(ua)) return "PC";
  return "";
}

// "iPhone 14 Pro · iOS 26.6 · 인스타그램 앱"
export function describeDevice(ua) {
  const s = String(ua || "").slice(0, 600);
  if (!s) return "";
  return [detectModel(s), detectOs(s), detectApp(s)]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 160);
}

// 인앱 브라우저 → 광고 플랫폼 이름(Meta 리드 알림의 "플랫폼" 칸과 같은 표기).
export function metaPlatformFromUa(ua, inflowApp = "") {
  const s = String(ua || "");
  if (inflowApp === "instagram-app" || /Instagram \d/.test(s)) {
    return "Instagram";
  }
  if (inflowApp === "facebook-app" || /FBAN\/|FBAV\/|FB_IAB|FBIOS/.test(s)) {
    return "Facebook";
  }
  return "";
}
