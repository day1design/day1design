// ========== 상담신청 관리 ==========
let records = [];
let selectedId = null;
let memoCache = {}; // { estimateId: [memos] }
let historyCache = {}; // { estimateId: history }

const body = document.getElementById("estBody");
const detail = document.getElementById("estDetail");

// 날짜·시각 칸은 오른쪽 끝 달력 아이콘을 정확히 겨눠야 달력이 열린다. 연·월·일
// 어디를 눌러도 열리게 받아 준다. 위임으로 달아 두면 계약 일시처럼 나중에
// 생기는 칸에도 그대로 걸린다.
detail?.addEventListener("click", (e) => {
  const el = e.target;
  if (!(el instanceof HTMLInputElement) || el.type !== "datetime-local") return;
  try {
    el.showPicker();
  } catch {
    /* 달력을 직접 못 여는 브라우저는 기본 동작에 맡긴다 */
  }
});
const detailModal = document.getElementById("estDetailModal");
const customerModal = document.getElementById("estCustomerModal");
const customerForm = document.getElementById("estCustomerForm");
const modalTitle = document.getElementById("estModalTitle");
const btnOpenCustomerEdit = document.getElementById("btnOpenCustomerEdit");
const btnSendSms = document.getElementById("btnSendSms");
const smsModal = document.getElementById("estSmsModal");
const smsForm = document.getElementById("estSmsForm");
const smsTo = document.getElementById("smsTo");
const smsTemplate = document.getElementById("smsTemplate");
const smsSubject = document.getElementById("smsSubject");
const smsContent = document.getElementById("smsContent");
const smsSubjectLen = document.getElementById("smsSubjectLen");
const smsContentLen = document.getElementById("smsContentLen");
const smsContentBytes = document.getElementById("smsContentBytes");
const smsHint = document.getElementById("smsHint");
let smsTemplatesCache = null;
const filterStatus = document.getElementById("filterStatus");
const sourceTabs = document.getElementById("sourceTabs");
let sourceTabKey = ""; // "" | "meta" | "homepage"
const filterSearch = document.getElementById("filterSearch");
const filterFrom = document.getElementById("filterFrom");
const filterTo = document.getElementById("filterTo");
const btnExportCsv = document.getElementById("btnExportCsv");
const periodSeg = document.getElementById("estPeriodSeg");
const rangePicker = document.getElementById("estRangePicker");

function syncModalLock() {
  const hasOpenModal =
    (detailModal && !detailModal.hidden) ||
    (customerModal && !customerModal.hidden) ||
    (smsModal && !smsModal.hidden);
  document.body.style.overflow = hasOpenModal ? "hidden" : "";
}

function openModal(el) {
  if (!el) return;
  el.hidden = false;
  syncModalLock();
}

function closeModal(el) {
  if (!el) return;
  el.hidden = true;
  syncModalLock();
}

function closeDetailModal() {
  closeModal(detailModal);
}

function closeCustomerModal() {
  closeModal(customerModal);
  if (customerForm) customerForm.innerHTML = "";
}

function closeSmsModal() {
  closeModal(smsModal);
}

detailModal
  ?.querySelectorAll("[data-est-close]")
  .forEach((el) => el.addEventListener("click", closeDetailModal));
customerModal
  ?.querySelectorAll("[data-customer-close]")
  .forEach((el) => el.addEventListener("click", closeCustomerModal));
smsModal
  ?.querySelectorAll("[data-sms-close]")
  .forEach((el) => el.addEventListener("click", closeSmsModal));
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (smsModal && !smsModal.hidden) {
    closeSmsModal();
    return;
  }
  if (customerModal && !customerModal.hidden) {
    closeCustomerModal();
    return;
  }
  if (detailModal && !detailModal.hidden) closeDetailModal();
});

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusBadge(s) {
  const map = {
    접수대기: "badge status-pending",
    상담중: "badge status-contact",
    견적완료: "badge status-estimate",
    계약완료: "badge status-done",
    취소: "badge status-cancel",
    "고객 부재중": "badge status-pending",
    "진행불가 (예산/범위/지역/일정등)": "badge status-cancel",
    "전화상담 후 미진행": "badge status-muted",
    "전화상담 후 미팅예약": "badge status-done",
    "전화상담 후 대기중": "badge status-contact",
    보류: "badge status-muted",
  };
  return `<span class="${map[s] || "badge"}">${escapeHtml(s || "—")}</span>`;
}

const SOURCE_LABEL_MAP = {
  homepage: "홈페이지",
  instagram_official: "인스타 오피셜",
  instagram_mkt: "인스타 마케팅",
  meta: "Meta",
  google: "Google",
  naver: "Naver",
  youtube: "YouTube",
  kakao: "Kakao",
  referral: "Referral",
  other: "기타",
};
function sourceKey(src) {
  const s = String(src || "homepage").toLowerCase();
  return SOURCE_LABEL_MAP[s] ? s : "other";
}

// 네이버는 서비스별로 갈라서 보여준다 — "첫 Naver"만으로는 블로그를 보고 온 건지
// 통합검색으로 찾아온 건지 알 수 없어 어느 채널이 리드를 만드는지 판단이 안 된다.
// 판별 근거는 FirstReferrer 호스트(=꼬리표 앞부분)이며 이미 저장돼 있던 값이다.
const NAVER_SERVICE_LABELS = [
  [/(^|\.)search\.naver\.com$/, "네이버검색"],
  [/(^|\.)blog\.naver\.com$/, "네이버블로그"],
  [/(^|\.)blog\.naverblogwidget\.com$/, "네이버블로그"],
  [/(^|\.)place\.naver\.com$/, "네이버플레이스"],
  [/(^|\.)cafe\.naver\.com$/, "네이버카페"],
  [/(^|\.)shopping\.naver\.com$/, "네이버쇼핑"],
];
function sourceLabelDetailed(key, referrerHost) {
  if (key !== "naver") return SOURCE_LABEL_MAP[key];
  const host = String(referrerHost || "")
    .trim()
    .toLowerCase();
  for (const [re, label] of NAVER_SERVICE_LABELS) {
    if (re.test(host)) return label;
  }
  return SOURCE_LABEL_MAP[key];
}

// 첫 진입 출처 — Worker가 자체 트래커 SessionId 의 최초 page_view 에서 추출
function firstSourceBadge(src, referrerHost) {
  const key = sourceKey(src);
  const label = sourceLabelDetailed(key, referrerHost);
  const detail = referrerHost ? ` · ${referrerHost}` : "";
  return `<span class="src-badge src-actual src-first src-${key}" title="첫 진입 출처 (자체 트래커 SessionId 기준)${escapeHtml(detail)}">첫 ${escapeHtml(label)}</span>`;
}

// 마지막 진입 출처 — 폼 제출 시점의 utm/슬러그 쿠키 기반 (광고→폼 직접 이동 등)
function lastSourceBadge(src) {
  const key = sourceKey(src);
  return `<span class="src-badge src-actual src-last src-${key}" title="마지막 진입 출처 (폼 제출 직전 utm/쿠키 기준)">끝 ${escapeHtml(SOURCE_LABEL_MAP[key])}</span>`;
}

// 마케팅 슬러그 경유 유입 (/go/{slug} 단축링크). 슬러그는 리다이렉트 때
// utm_campaign 을 SourceLabel 과 같은 값으로 심으므로 Referral === Campaign 이면
// 슬러그 유입이다. Meta 리드는 Referral="Meta 광고" · Campaign=광고캠페인명이라 갈린다.
// (옛 폼의 고객 직접입력 값은 Campaign 이 비어 있어 역시 구분된다)
function isSlugLead(record) {
  const referral = String(record?.Referral || "").trim();
  const campaign = String(record?.Campaign || "").trim();
  return Boolean(referral) && referral === campaign;
}
// 검색어는 유입 주소 뒷부분(query)에 실려 온다. 네이버 query / 구글 q 등
// 검색엔진마다 파라미터 이름이 달라 후보를 순서대로 본다. 값이 없으면 빈 문자열
// — 검색엔진이 검색어를 안 실어 보내는 경우가 있어 "없음"이 정상 결과일 수 있다.
const SEARCH_QUERY_KEYS = ["query", "q", "search_query", "keyword", "wd"];
function extractSearchKeyword(refPath) {
  const raw = String(refPath || "");
  const qs = raw.indexOf("?");
  if (qs < 0) return "";
  try {
    const params = new URLSearchParams(raw.slice(qs + 1));
    for (const key of SEARCH_QUERY_KEYS) {
      const value = (params.get(key) || "").trim();
      if (value) return value;
    }
  } catch {}
  return "";
}

// 카드 목록에도 검색어를 노출한다 — 상세를 열지 않고 어떤 말로 찾아온 고객인지
// 훑을 수 있어야 검색 채널 판단이 된다. 검색어가 없으면 줄 자체를 안 그린다.
function cardKeywordHtml(r) {
  const keyword = extractSearchKeyword(r?.FirstRefPath);
  if (!keyword) return "";
  return `
        <span>
          <b>검색어</b>
          <em class="est-card-keyword">${escapeHtml(keyword)}</em>
        </span>`;
}

// 상세 모달의 유입 정보 — 첫 진입 주소 전체(호스트+뒷부분)와 검색어.
// 블로그 유입이면 "어느 글에서 왔는지"가 이 링크로 바로 열린다.
// RefPath 는 2026-08-11 부터 쌓이므로 그 이전 접수건은 호스트까지만 나온다.
// 표준 필드로 흡수되지 않은 폼 응답만 { 질문: 답변 } 으로 추린다.
// 엑셀 열·상담카드 행이 이 결과를 그대로 따라가므로, 폼에 질문이 늘면 열과 행도 같이 는다.
function metaAnswerMap(r) {
  let parsed = [];
  try {
    parsed = JSON.parse(r.MetaFieldData || "[]");
  } catch {
    return {};
  }
  if (!Array.isArray(parsed)) return {};
  const map = {};
  for (const p of parsed) {
    if (p && p.q && p.a && !p.f) map[String(p.q)] = String(p.a);
  }
  return map;
}

// Meta 인스턴트폼 응답 원문(질문·답변 그대로). Meta 쪽 입력폼 질문이 바뀌어도
// 이 목록이 새 질문을 그대로 보여주므로 상담카드를 손볼 필요가 없다.
// 표준 8필드로 매핑된 항목(이름·연락처·공간 등)은 위쪽에 이미 나오므로 여기서는 생략한다.
// Meta 폼 질문 key 를 사람이 읽는 라벨로 정리한다.
// Meta 는 공백을 `_` 로 바꾸고 안내문을 괄호로 붙여 보낸다:
//   `가용_예산(프로젝트_방향성_설정을_위해_대략적으로_기입해주세요)` → `가용 예산`
function formLabel(question) {
  const cleaned = String(question || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || String(question || "");
}

// 표준 요약 필드로 흡수되지 않은 폼 응답을 접수 정보 dl 의 **정식 항목**으로 편입한다.
// 질문 문구가 그대로 항목 라벨이 되므로, 폼을 조정하면 상담카드의 항목 구성도 같이 바뀐다.
// (D1 컬럼을 새로 만들지는 않는다 — 질문이 사라져도 죽은 컬럼이 남고, 통계·필터가 쓰는
//  기존 컬럼과 섞이면 접수 집계가 오염된다. 원본은 MetaFieldData JSON 한 곳에 있다.)
function metaFormRows(r) {
  let pairs = [];
  try {
    const parsed = JSON.parse(r.MetaFieldData || "[]");
    if (Array.isArray(parsed)) pairs = parsed;
  } catch {
    return "";
  }
  return pairs
    .filter((p) => p && p.q && p.a && !p.f)
    .map((p) => {
      const label = formLabel(p.q);
      const short = label.length > 24 ? `${label.slice(0, 24)}…` : label;
      return (
        `<dt class="form-dt" title="${escapeHtml(label)}">${escapeHtml(short)}</dt>` +
        `<dd>${escapeHtml(String(p.a))}</dd>`
      );
    })
    .join("");
}

function inflowDetailRows(r) {
  const host = String(r.FirstReferrer || "").trim();
  if (!host) return "";
  const path = String(r.FirstRefPath || "").trim();
  const keyword = extractSearchKeyword(path);
  const url = `https://${host}${path}`;
  const linkCell = path
    ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url.length > 90 ? url.slice(0, 90) + "…" : url)}</a>`
    : `${escapeHtml(host)} <span class="muted">(상세 주소는 2026-08-11 이전 접수라 미수집)</span>`;
  return `
          <dt>유입 링크</dt><dd class="est-inflow-link">${linkCell}</dd>
          ${keyword ? `<dt>검색어</dt><dd><b>${escapeHtml(keyword)}</b></dd>` : ""}`;
}

// 채널 집계의 기준 — 끝(Source)이 아니라 첫 유입(FirstSource) 이다.
// 끝 기준이면 홈페이지를 거쳐 문의한 고객이 전부 "홈페이지"로 뭉쳐 네이버·구글이
// 묻힌다(8월 실측: 네이버 유입 3건 중 1건만 잡혔다). Meta 리드는 홈페이지를
// 거치지 않아 FirstSource 가 없으므로 Source(meta) 로 떨어진다.
function channelEntry(r) {
  const raw =
    String(r?.FirstSource || "").trim() ||
    String(r?.Source || "homepage").trim();
  const key = sourceKey(raw);
  if (key === "naver") {
    return { key, label: sourceLabelDetailed(key, r?.FirstReferrer) };
  }
  // 첫 유입이 홈페이지 = 꼬리표 없는 직접 진입. 매체와 구분되게 라벨을 붙인다
  if (key === "homepage") return { key, label: "홈페이지(직접)" };
  return { key, label: SOURCE_LABEL_MAP[key] };
}

// 리퍼러가 지워져 출처가 미상인 접수에만 단서를 붙인다 — 이미 출처가 잡힌 건에는
// 뱃지를 늘리지 않는다. 네이버·카카오·인스타 인앱 브라우저는 리퍼러를 지우고 보내지만
// User-Agent 에는 앱 이름이 남아서, 그것만으로도 어디서 눌렀는지가 좁혀진다.
// legacy-link 는 아임웹 시절 게시판 주소로 들어온 경우다.
const INFLOW_APP_LABELS = {
  "naver-app": "네이버앱",
  kakaotalk: "카카오톡",
  "instagram-app": "인스타앱",
  "facebook-app": "페북앱",
  "legacy-link": "옛 링크",
};

function inflowAppBadge(record) {
  const label = INFLOW_APP_LABELS[String(record?.FirstInflowApp || "").trim()];
  if (!label) return "";
  const first = String(record?.FirstSource || "").trim();
  if (first && sourceKey(first) !== "homepage") return "";
  return `<span class="src-badge src-inflow-app" title="리퍼러가 없어 출처가 미상인 접수입니다. 접속 환경과 주소로 좁힌 단서입니다">${escapeHtml(label)}</span>`;
}

function slugBadge(record) {
  if (!isSlugLead(record)) return "";
  const label = String(record.Referral || "").trim();
  return `<span class="src-badge src-slug" title="마케팅 슬러그(/go/) 경유 유입 · utm_campaign=${escapeHtml(label)}">슬러그 ${escapeHtml(label)}</span>`;
}

// 카드용 출처 뱃지 — [슬러그] [첫] [끝] inline
// 예전의 "입력 ○○" 뱃지는 뺐다. 접수 폼에 고객이 유입경로를 고르는 항목이
// 없어졌는데도(간소화) Referral 에 마케팅 슬러그 라벨이 들어오면서
// "고객이 직접 선택"이라는 설명이 사실과 달라졌기 때문이다.
// First*가 없으면(예: 마이그 전 기존 데이터) Source(끝)만 표시
function sourceBadges(record) {
  const slug = `${slugBadge(record)} ${inflowAppBadge(record)}`.trim();
  const firstRaw = String(record.FirstSource || "").trim();
  const lastRaw = String(record.Source || "homepage").trim();
  const refHost = String(record.FirstReferrer || "").trim();
  if (firstRaw) {
    const firstLabel = sourceLabelDetailed(sourceKey(firstRaw), refHost);
    const lastLabel = SOURCE_LABEL_MAP[sourceKey(lastRaw)];
    // 세부 라벨까지 같을 때만 생략한다. 첫=끝=naver 라도 "첫 네이버블로그"는
    // "끝 Naver"가 담지 못하는 정보라 남긴다
    if (firstLabel !== lastLabel) {
      return `${slug} ${firstSourceBadge(firstRaw, refHost)} ${lastSourceBadge(lastRaw)}`.trim();
    }
  }
  // 첫=끝 또는 첫 없음 → 끝 하나만 (라벨은 "실제")
  return `${slug} ${lastSourceBadge(lastRaw)}`.trim();
}

// ===== KST 변환 헬퍼 (D1 SubmittedAt = UTC ISO, 표시는 KST) =====
// KST(UTC+9) 날짜 키 (YYYY-MM-DD)
function kstDateKey(iso) {
  if (!iso) return "날짜 없음";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "날짜 없음";
  const d = new Date(t);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

// 상담 예약은 요일까지 읽혀야 한다 — "9/12 14:30" 만으로는 무슨 요일인지 몰라
// 일정을 잡을 때 달력을 다시 열어 보게 된다.
function fmtConsultAt(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (n) => String(n).padStart(2, "0");
    const dow = "일월화수목금토"[d.getDay()];
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}(${dow}) ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

function fmtInt(n) {
  return Number(n || 0).toLocaleString("ko-KR");
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// 기간 세그먼트 — N일이면 오늘 포함 최근 N일(당일=0 → 오늘 하루).
// 이 화면의 기간 컨트롤은 이것 하나뿐이다. 별도 상태를 두지 않고 기간 입력
// (filterFrom/To)을 직접 세팅하므로 접수채널·목록·CSV 가 한 경로로 따라온다.
// '선택기간' 만 날짜 입력을 노출하고 값은 사용자가 정한다.
function ymdLocal(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function applyPeriod(period) {
  if (!filterFrom || !filterTo) return;
  // 선택기간은 날짜 입력을 열어줄 뿐, 값은 건드리지 않는다
  if (period === "custom") return;
  if (period === "all") {
    filterFrom.value = "";
    filterTo.value = "";
    return;
  }
  const days = Number(period);
  if (!Number.isFinite(days)) return;
  const today = startOfDay(new Date());
  const from = new Date(today);
  if (days > 0) from.setDate(from.getDate() - (days - 1));
  filterFrom.value = ymdLocal(from);
  filterTo.value = ymdLocal(today);
}

function setActivePeriod(period) {
  if (!periodSeg) return;
  periodSeg.querySelectorAll("[data-period]").forEach((b) => {
    const on = b.dataset.period === period;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

// 날짜 입력은 '선택기간' 일 때만 보인다 — 나머지 버튼은 기간을 스스로 계산하므로
// 입력칸이 떠 있으면 어느 쪽이 진짜인지 헷갈린다.
function togglePeriodPicker(period) {
  if (rangePicker) rangePicker.hidden = period !== "custom";
}

// 접수채널 집계 — Source 컬럼 기준. 현재 필터(기간·상태·검색·유입탭)가
// 그대로 반영된 목록을 센다. 필터를 바꾸면 같이 움직인다.
function fmtShare(count, total) {
  if (!total) return "—";
  const pct = (count / total) * 100;
  if (pct > 0 && pct < 10) return `${pct.toFixed(1).replace(/\.0$/, "")}%`;
  return `${Math.round(pct)}%`;
}

function renderChannelStats(list) {
  const wrap = document.getElementById("estChannelList");
  const sub = document.getElementById("estChannelSub");
  if (!wrap) return;
  const total = list.length;
  if (!total) {
    wrap.innerHTML =
      '<div class="est-channel-empty">해당 조건의 접수가 없습니다</div>';
    if (sub) sub.textContent = "—";
    return;
  }
  // 채널 키는 첫 유입(FirstSource) 기준이되, 네이버는 첫 진입 호스트로 갈라 센다
  // (통합검색/블로그/플레이스가 한 덩어리면 어느 채널이 리드를 만드는지 안 보인다).
  // 마케팅 슬러그 경유분은 매체 분류와 별개로 한 줄 더 세어 준다 — 슬러그를
  // 뿌린 쪽의 성과를 매체 집계에 섞지 않고 따로 보기 위함.
  const counts = new Map();
  let slugCount = 0;
  for (const r of list) {
    const { key, label } = channelEntry(r);
    const entry = counts.get(label) || { key, label, count: 0 };
    entry.count += 1;
    counts.set(label, entry);
    if (isSlugLead(r)) slugCount += 1;
  }
  const items = [...counts.values()].sort((a, b) => b.count - a.count);
  // 막대 길이 = 전체 대비 비중. 비중이 1% 미만이어도 막대가 사라지지 않도록
  // 최소 길이를 준다(CSS min-width).
  const barRow = (key, labelHtml, count, extraClass, titleAttr) => `
      <div class="est-channel-item ${extraClass || ""}"${titleAttr || ""}>
        <span class="est-channel-name">${labelHtml}</span>
        <span class="est-channel-track">
          <i class="est-channel-fill bar-${key}" style="width:${((count / total) * 100).toFixed(2)}%"></i>
        </span>
        <span class="est-channel-val"
          ><strong>${fmtInt(count)}</strong><em>${fmtShare(count, total)}</em></span
        >
      </div>`;
  const slugItem = slugCount
    ? barRow(
        "slug",
        '<span class="src-badge src-slug">슬러그 경유</span>',
        slugCount,
        "est-channel-slug",
        ' title="마케팅 슬러그(/go/) 경유 · 위 매체 집계와 중복 집계됩니다"',
      )
    : "";
  wrap.innerHTML =
    items
      .map((item) =>
        barRow(
          item.key,
          escapeHtml(item.label),
          item.count,
          "",
          ` title="${escapeHtml(item.label)} ${fmtInt(item.count)}건 · ${fmtShare(item.count, total)}"`,
        ),
      )
      .join("") + slugItem;
  if (sub) {
    const slugNote = slugCount ? ` · 슬러그 경유 ${fmtInt(slugCount)}건` : "";
    sub.textContent = `현재 조건 ${fmtInt(total)}건 · ${items.length}개 채널${slugNote}`;
  }
}

function filtered() {
  const st = filterStatus.value;
  const tab = sourceTabKey; // "" | "meta" | "homepage"
  const q = filterSearch.value.trim().toLowerCase();
  // 사용자 로컬(KST) 기준 정확한 일자 경계 — 일부 브라우저가
  // "YYYY-MM-DDT00:00:00" 을 UTC 로 해석해 하루 어긋나던 문제 방지.
  const toTsLocal = (ymd, end) => {
    if (!ymd) return null;
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(
      y,
      m - 1,
      d,
      end ? 23 : 0,
      end ? 59 : 0,
      end ? 59 : 0,
    ).getTime();
  };
  const fromTs = toTsLocal(filterFrom?.value, false);
  const toTs = toTsLocal(filterTo?.value, true);
  return records.filter((r) => {
    if (st && r.Status !== st) return false;
    // 탭 필터: Meta = Source==="meta", 홈페이지 = 그 외
    if (tab === "meta") {
      if ((r.Source || "").toLowerCase() !== "meta") return false;
    } else if (tab === "homepage") {
      if ((r.Source || "").toLowerCase() === "meta") return false;
    }
    if (fromTs || toTs) {
      const t = Date.parse(r.SubmittedAt || "");
      if (isNaN(t)) return false;
      if (fromTs && t < fromTs) return false;
      if (toTs && t > toTs) return false;
    }
    if (q) {
      const hay =
        `${r.Name} ${r.Phone} ${r.Address} ${r.Email} ${r.Campaign || ""} ${r.Referral || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// 상담을 실제로 진행하는 지점. 고객이 접수 때 고른 희망 지점(Branch)과 다를 수
// 있어 따로 고른다. 지점이 늘면 여기에 추가하면 되고, 목록에 없는 값이 이미
// 저장돼 있으면 그 값도 선택지에 남겨 덮어쓰지 않는다.
const CONSULT_BRANCHES = ["강남점", "판교점", "고객 현장", "화상 상담"];

// 상태 드롭다운. '계약완료' 는 여기 없다 — 계약은 일시·담당자·금액을 같이
// 받아야 하므로 아래 계약 패널의 버튼으로만 처리한다. 드롭다운에 두면 금액을
// 안 넣은 계약완료가 생긴다.
const EST_STATUSES = [
  "접수대기",
  "고객 부재중",
  "진행불가 (예산/범위/지역/일정등)",
  "전화상담 후 미진행",
  "전화상담 후 미팅예약",
  "전화상담 후 대기중",
  "보류",
];

const CONTRACT_STATUS = "계약완료";

// 계약 패널 — 계약이 아닌 건에는 버튼 하나만 두고 입력칸을 감춘다. 쓰지도 않을
// 칸이 늘 펼쳐져 있으면 상담 관리 화면이 계약서처럼 보인다.
// 계약된 건은 값을 바로 펼쳐 두어 수정할 수 있게 한다.
function contractPanelHtml(r) {
  const done = r.Status === CONTRACT_STATUS;
  const amount = Number(r.ContractAmount || 0) || Number(r.EstimateAmount || 0);
  return `
    <div class="est-contract ${done ? "is-done" : ""}" id="contractPanel" data-open="${done ? "1" : "0"}">
      <div class="est-contract-head">
        <span class="est-contract-title">계약</span>
        ${
          done
            ? `<span class="est-contract-chip">계약완료</span>`
            : `<button type="button" class="btn btn-sm btn-primary" id="btnContractOpen">계약완료 처리</button>`
        }
      </div>
      <div class="est-contract-body" ${done ? "" : "hidden"}>
        <div class="est-manage-grid">
          <div class="field">
            <label>계약 일시</label>
            <input type="datetime-local" id="editContractAt" value="${(r.ContractAt || "").slice(0, 16)}" />
          </div>
          <div class="field">
            <label>계약 담당자</label>
            <input type="text" id="editContractOwner" value="${escapeHtml(r.ContractOwner || r.Assignee || "")}" />
          </div>
          <div class="field">
            <label>계약 금액 (원)</label>
            <input type="number" id="editContractAmount" min="0" value="${amount}" />
          </div>
        </div>
        ${
          done
            ? `<button type="button" class="btn btn-ghost btn-sm" id="btnContractCancel">계약완료 해제</button>`
            : `<p class="est-contract-note">저장하면 상태가 '계약완료' 로 바뀝니다.</p>`
        }
      </div>
    </div>`;
}

// 목록에 없는 값이 이미 저장돼 있으면(계약완료, 옛 상태값) 선택지로 덧붙인다.
// 안 그러면 그 카드를 열어 저장하는 순간 첫 항목으로 덮어써진다.
function statusOptions(current) {
  const list = EST_STATUSES.includes(current)
    ? EST_STATUSES
    : current
      ? [...EST_STATUSES, current]
      : EST_STATUSES;
  return list
    .map(
      (s) =>
        `<option value="${escapeHtml(s)}"${current === s ? " selected" : ""}>${escapeHtml(s)}</option>`,
    )
    .join("");
}

// ===== CSV 다운로드 (UTF-8 BOM, 엑셀 호환) =====
const SOURCE_LABELS_EXPORT = {
  homepage: "홈페이지",
  instagram_official: "인스타 오피셜(오가닉)",
  instagram_mkt: "인스타 마케팅(오가닉)",
  meta: "Meta 광고",
  google: "Google",
  naver: "Naver",
  youtube: "YouTube",
  kakao: "Kakao",
  referral: "Referral",
  other: "기타",
};
function csvEscape(v) {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function exportFilteredCsv() {
  const list = filtered();
  if (!list.length) {
    adminUtil.toast?.("내보낼 접수 데이터가 없습니다", "error");
    return;
  }
  // Meta 입력폼이 조정되면 새 질문이 그대로 열로 붙는다. 열 순서는 실제 응답 등장 순서.
  const answerMaps = list.map(metaAnswerMap);
  const formCols = [];
  for (const map of answerMaps) {
    for (const question of Object.keys(map)) {
      if (!formCols.includes(question)) formCols.push(question);
    }
  }
  const headers = [
    "접수일시",
    "이름",
    "연락처",
    "이메일",
    "출처",
    "캠페인",
    "공간유형",
    "평형",
    "지점",
    "주소",
    "상세주소",
    "희망일정",
    "가용예산",
    "상담예약일시",
    "상담지점",
    "상태",
    "담당자",
    "메모",
    "유입경로",
    ...formCols.map(formLabel),
  ];
  const rows = list.map((r, i) => {
    const srcKey = (r.Source || "homepage").toLowerCase();
    return [
      fmtDateTime(r.SubmittedAt) || "",
      r.Name || "",
      r.Phone || "",
      r.Email || "",
      SOURCE_LABELS_EXPORT[srcKey] || srcKey,
      r.Campaign || "",
      r.SpaceType || "",
      r.SpaceSize || "",
      r.Branch || "",
      r.Address || "",
      r.AddressDetail || "",
      r.Schedule || "",
      r.Budget || r.Detail || "",
      r.ConsultAt ? fmtConsultAt(r.ConsultAt) : "",
      r.ConsultBranch || "",
      r.Status || "",
      r.Assignee || "",
      r.Memo || "",
      r.Referral || "",
      ...formCols.map((question) => answerMaps[i][question] || ""),
    ];
  });
  const csv = [headers, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\r\n");
  const bom = "﻿";
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const fromTxt = filterFrom?.value || "all";
  const toTxt = filterTo?.value || "all";
  const fname = `dayone-estimates_${fromTxt}_to_${toTxt}.csv`;
  const a = document.createElement("a");
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 500);
  adminUtil.toast?.(`${list.length}건 다운로드`, "success");
}

function customerKey(r) {
  const phone = String(r.Phone || "").replace(/\D/g, "");
  if (phone) return `p:${phone}`;
  const email = String(r.Email || "")
    .trim()
    .toLowerCase();
  if (email) return `e:${email}`;
  return `n:${String(r.Name || "")
    .trim()
    .toLowerCase()}`;
}

function buildSessionMap(sourceRecords) {
  const counts = {};
  const map = {};
  [...sourceRecords]
    .sort((a, b) => new Date(a.SubmittedAt || 0) - new Date(b.SubmittedAt || 0))
    .forEach((r) => {
      const key = customerKey(r);
      counts[key] = (counts[key] || 0) + 1;
      map[r.id] = counts[key];
    });
  return map;
}

function sessionBadgeHtml(sessionNo) {
  const n = Number(sessionNo) || 1;
  const label = n > 1 ? `${n}회접수` : "신규";
  return `<span class="session-pill ${n > 1 ? "is-repeat" : "is-new"}">${label}</span>`;
}

function briefText(r, fallback = "접수내용 없음") {
  const typeSize = [r.SpaceType, r.SpaceSize].filter(Boolean).join(" / ");
  return r.Detail || typeSize || r.Address || r.Campaign || fallback;
}

function render() {
  const list = filtered();
  renderChannelStats(list);
  if (!list.length) {
    body.innerHTML = '<div class="empty-state">접수 내역이 없습니다.</div>';
    return;
  }
  const sessionMap = buildSessionMap(records);
  const groups = [];
  for (const r of list) {
    const submittedDate = kstDateKey(r.SubmittedAt);
    let group = groups[groups.length - 1];
    if (!group || group.date !== submittedDate) {
      group = { date: submittedDate, cards: [] };
      groups.push(group);
    }
    group.cards.push(r);
  }
  body.innerHTML = groups
    .map((group) => {
      const cardsHtml = group.cards
        .map((r) => {
          const branch = r.Branch || "지점 미지정";
          const summary = briefText(r);
          const contact = r.Phone || r.Email || "연락처 없음";
          const typeSize =
            [r.SpaceType, r.SpaceSize].filter(Boolean).join(" / ") ||
            "공간 미입력";
          const schedule = r.Schedule || "일정 미입력";
          const sessionNo = sessionMap[r.id] || 1;
          return `
    <button type="button" data-id="${r.id}" class="est-card ${r.id === selectedId ? "is-selected" : ""}">
      <span class="est-card-head">
        <span class="est-card-title">
          <strong>${escapeHtml(r.Name || "이름 없음")}</strong>
          <small>${escapeHtml(contact)}</small>
        </span>
        <span class="est-card-tags">
          ${statusBadge(r.Status)}
        </span>
      </span>
      <span class="est-card-info">
        <span>
          <b>공간</b>
          <em>${escapeHtml(typeSize)}</em>
        </span>
        <span>
          <b>일정</b>
          <em>${escapeHtml(schedule)}</em>
        </span>
        <span>
          <b>지점</b>
          <em>${escapeHtml(branch)}</em>
        </span>
        ${
          r.ConsultAt
            ? `
        <span class="est-card-consult">
          <b>상담 예약</b>
          <em>${escapeHtml(fmtConsultAt(r.ConsultAt))}${r.ConsultBranch ? ` · ${escapeHtml(r.ConsultBranch)}` : ""}</em>
        </span>`
            : ""
        }
        <span>
          <b>유입</b>
          <em>${sourceBadges(r)} ${sessionBadgeHtml(sessionNo)}</em>
        </span>
        ${
          r.Email
            ? `
        <span>
          <b>이메일</b>
          <em>${escapeHtml(r.Email)}</em>
        </span>`
            : ""
        }
        ${cardKeywordHtml(r)}
      </span>
      <span class="est-card-summary">
        <b>접수내용</b>
        <em>${escapeHtml(summary)}</em>
      </span>
      <span class="est-card-action">상세 보기</span>
    </button>`;
        })
        .join("");
      return `
    <section class="est-date-group">
      <div class="est-date-head">
        <strong>${escapeHtml(group.date)}</strong>
        <span>${group.cards.length}건</span>
      </div>
      <div class="est-date-cards">${cardsHtml}</div>
    </section>`;
    })
    .join("");
  body.querySelectorAll(".est-card").forEach((card) => {
    card.addEventListener("click", () => openDetail(card.dataset.id));
  });
}

// 예약이 며칠 뒤인지 — 날짜만 비교한다(시각까지 보면 오늘이 어제로 밀린다)
function ddayText(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((a - b) / 86400000);
  if (diff === 0) return "오늘";
  if (diff === 1) return "내일";
  if (diff === -1) return "어제";
  return diff > 0 ? `${diff}일 뒤` : `${-diff}일 지남`;
}

// 예약 띠 — 저장 뒤에도 이 함수로 다시 그린다
function consultBandHtml(r) {
  if (!r.ConsultAt) {
    return `<div class="nd-book none"><span>📅 상담 예약 미정</span></div>`;
  }
  const dday = ddayText(r.ConsultAt);
  return `<div class="nd-book">
      <span>📅 ${escapeHtml(fmtConsultAt(r.ConsultAt))} · ${escapeHtml(r.ConsultBranch || "지점 미정")}</span>
      ${dday ? `<span class="dday">${escapeHtml(dday)}</span>` : ""}
    </div>`;
}

// 첨부 조각에 붙일 이름 — 확장자를 보고 앞에 표시를 하나 단다
function fileLabel(u) {
  let name = String(u).split("/").pop() || "파일";
  try {
    name = decodeURIComponent(name);
  } catch {
    /* 인코딩이 깨진 이름은 원문 그대로 쓴다 */
  }
  const ext = name.split(".").pop().toLowerCase();
  const mark = ["jpg", "jpeg", "png", "webp", "gif", "svg"].includes(ext)
    ? "🖼"
    : "📄";
  return `${mark} ${name}`;
}

function filesList(raw) {
  if (!Array.isArray(raw) || !raw.length) return "<em>없음</em>";
  return raw
    .map(
      (u) =>
        `<a href="${escapeHtml(u)}" target="_blank" rel="noopener" class="file-chip">${escapeHtml(u.split("/").pop())}</a>`,
    )
    .join("");
}

function historyHtml(history) {
  if (!history)
    return `<div class="history-box">이전 접수 내역 조회 중...</div>`;
  const total = history.total || 1;
  const sessionNo = history.sessionNo || 1;
  const prev = history.previousLatest;
  const sessionLine =
    sessionNo > 1
      ? `<span class="session-pill">${sessionNo}회차</span> <span style="font-size:12px;color:var(--c-text-sub);">(총 ${total}회)</span>`
      : `<span class="session-pill" style="background:#d1fae5;color:#065f46;">신규 고객</span>`;

  let html = `<div class="history-box"><h4>상담 회차</h4><div style="margin-bottom:8px;">${sessionLine}</div>`;
  if (prev) {
    html += `<div style="font-size:12px;color:var(--c-text-sub);margin-bottom:4px;">직전 접수</div>`;
    const items = (history.previous || []).slice(0, 5);
    html += items
      .map((p) => {
        const src = (p.source || "homepage").toLowerCase();
        const srcLabel = src === "meta" ? "Meta" : "홈페이지";
        return `<div class="history-item">
          <span class="h-date">${escapeHtml(fmtDateTime(p.submittedAt))}</span>
          <span class="h-meta">· ${escapeHtml(srcLabel)} · ${escapeHtml(p.status || "—")}${p.branch ? " · " + escapeHtml(p.branch) : ""}</span>
        </div>`;
      })
      .join("");
    if ((history.previous || []).length > 5) {
      html += `<div style="font-size:11px;color:var(--c-text-sub);margin-top:4px;">외 ${history.previous.length - 5}건</div>`;
    }
  }
  html += "</div>";
  return html;
}

function memoItemHtml(memo) {
  const updated = memo.updatedAt && memo.updatedAt !== memo.createdAt;
  return `
    <div class="memo-item" data-memo-id="${memo.id}">
      <div class="memo-head">
        <span><strong>${escapeHtml(memo.author || "관리자")}</strong> · ${escapeHtml(fmtDateTime(memo.createdAt))}${updated ? " <span style='color:#94a3b8;'>(수정됨)</span>" : ""}</span>
        <span class="memo-actions">
          <button type="button" data-act="edit">수정</button>
          <button type="button" data-act="del">삭제</button>
        </span>
      </div>
      <div class="memo-body">${escapeHtml(memo.body)}</div>
    </div>
  `;
}

function memoThreadHtml(memos) {
  if (!memos || !memos.length) {
    return `<div class="memo-empty">아직 작성된 메모가 없습니다. 아래에서 새 메모를 추가하세요.</div>`;
  }
  return memos.map(memoItemHtml).join("");
}

function customerEditFormHtml(r) {
  return `
    <div class="field-row-2">
      <div class="field">
        <label>이름</label>
        <input type="text" id="cName" value="${escapeHtml(r.Name || "")}" />
      </div>
      <div class="field">
        <label>연락처</label>
        <input type="tel" id="cPhone" value="${escapeHtml(r.Phone || "")}" />
      </div>
    </div>
    <div class="field">
      <label>이메일</label>
      <input type="email" id="cEmail" value="${escapeHtml(r.Email || "")}" />
    </div>
    <div class="field-row-2">
      <div class="field">
        <label>공간 유형</label>
        <select id="cSpaceType">
          ${["", "아파트", "빌라", "주택", "상가", "기타"]
            .map(
              (s) =>
                `<option value="${s}" ${r.SpaceType === s ? "selected" : ""}>${s || "— 선택 —"}</option>`,
            )
            .join("")}
        </select>
      </div>
      <div class="field">
        <label>공간 면적</label>
        <select id="cSpaceSize">
          ${["", "20~30평", "30~40평", "40~50평", "50평 이상", "기타"]
            .map(
              (s) =>
                `<option value="${s}" ${r.SpaceSize === s ? "selected" : ""}>${s || "— 선택 —"}</option>`,
            )
            .join("")}
        </select>
      </div>
    </div>
    <div class="field-row-3">
      <div class="field" style="flex:0 0 110px">
        <label>우편번호</label>
        <input type="text" id="cPostcode" value="${escapeHtml(r.Postcode || "")}" />
      </div>
      <div class="field" style="flex:1">
        <label>주소</label>
        <input type="text" id="cAddress" value="${escapeHtml(r.Address || "")}" />
      </div>
    </div>
    <div class="field">
      <label>상세주소</label>
      <input type="text" id="cAddressDetail" value="${escapeHtml(r.AddressDetail || "")}" />
    </div>
    <div class="field-row-2">
      <div class="field">
        <label>공사 희망 일정</label>
        <input type="text" id="cSchedule" value="${escapeHtml(r.Schedule || "")}" placeholder="예: 00년 00월" />
      </div>
      <div class="field">
        <label>지점</label>
        <input type="text" id="cBranch" value="${escapeHtml(r.Branch || "")}" />
      </div>
    </div>
    <div class="field">
      <label>유입 경로</label>
      <input type="text" id="cReferral" value="${escapeHtml(r.Referral || "")}" />
    </div>
    <div class="field">
      <label>상세 내용</label>
      <textarea id="cDetail" rows="5">${escapeHtml(r.Detail || "")}</textarea>
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost" data-customer-close-form type="button">취소</button>
      <button class="btn btn-primary" id="btnSaveCustomer" type="submit">고객 정보 저장</button>
    </div>
  `;
}

function openCustomerEdit(id) {
  const r = records.find((x) => x.id === id);
  if (!r || !customerForm) return;
  const title = document.getElementById("customerModalTitle");
  if (title) title.textContent = `${r.Name || "이름 없음"} 고객정보 수정`;
  customerForm.innerHTML = customerEditFormHtml(r);
  customerForm.onsubmit = (e) => {
    e.preventDefault();
    doSaveCustomer(id);
  };
  customerForm
    .querySelector("[data-customer-close-form]")
    ?.addEventListener("click", closeCustomerModal);
  openModal(customerModal);
  customerForm.querySelector("#cName")?.focus();
}

async function openDetail(id) {
  const r = records.find((x) => x.id === id);
  if (!r) return;
  selectedId = id;
  render();
  const history = historyCache[id];
  const sessionNo = history?.sessionNo || buildSessionMap(records)[id] || 1;
  if (modalTitle) modalTitle.textContent = `${r.Name || "이름 없음"} 접수 상세`;
  if (btnOpenCustomerEdit) {
    btnOpenCustomerEdit.onclick = () => openCustomerEdit(id);
  }
  if (btnSendSms) {
    btnSendSms.onclick = () => openSmsModal(id);
  }

  const attachments = [
    ...(Array.isArray(r.ConceptFiles) ? r.ConceptFiles : []),
    ...(Array.isArray(r.FloorPlans) ? r.FloorPlans : []),
  ];
  const keyword = extractSearchKeyword(r?.FirstRefPath);
  const formRows = metaFormRows(r);
  const isMeta = (r.Source || "").toLowerCase() === "meta";
  const inflowRows =
    (r.Referral
      ? `<dt>${isSlugLead(r) ? "마케팅 슬러그" : "경로"}</dt><dd>${escapeHtml(r.Referral)}</dd>`
      : "") +
    inflowDetailRows(r) +
    (isMeta
      ? `<dt>Meta 플랫폼</dt><dd>${escapeHtml(r.Platform || "—")}</dd>` +
        `<dt>Meta 캠페인</dt><dd>${escapeHtml(r.Campaign || "—")}</dd>`
      : "");
  const inflowCount = (inflowRows.match(/<dt/g) || []).length;
  const spaceText = [r.SpaceType, r.SpaceSize].filter(Boolean).join(" · ");
  const addressText = [r.Postcode, r.Address, r.AddressDetail]
    .filter(Boolean)
    .join(" ");

  detail.innerHTML = `
    <div class="nd-top">
      <div class="nd-row1">
        <span class="nd-name">${escapeHtml(r.Name || "이름 없음")}</span>
        <span id="detailSessionSlot">${sessionBadgeHtml(sessionNo)}</span>
        ${sourceBadges(r)}
        ${keyword ? `<span class="nd-kw">🔍 ${escapeHtml(keyword)}</span>` : ""}
        <span class="nd-sp"></span>
        ${statusBadge(r.Status)}
      </div>
      <div class="nd-row2">
        ${r.Phone ? `<a class="nd-act" href="tel:${escapeHtml(String(r.Phone).replace(/[^0-9+]/g, ""))}">📞 ${escapeHtml(r.Phone)}</a>` : ""}
        ${r.Email ? `<a class="nd-act" href="mailto:${escapeHtml(r.Email)}">✉ ${escapeHtml(r.Email)}</a>` : ""}
        ${r.Phone || r.Email ? `<button class="nd-act ghost" type="button" id="btnCopyContact">복사</button>` : ""}
      </div>
      <div class="nd-meta">
        ${fmtDateTime(r.SubmittedAt)} 접수 · IP ${escapeHtml(r.IP || "—")} · 희망 지점 ${escapeHtml(r.Branch || "미지정")}
      </div>
    </div>

    ${consultBandHtml(r)}

    <input class="pt" type="radio" name="ndTab" id="ndTab1" checked />
    <input class="pt" type="radio" name="ndTab" id="ndTab2" />
    <div class="nd-tabbar">
      <div class="nd-seg">
        <label class="lb1" for="ndTab1">접수 정보</label>
        <label class="lb2" for="ndTab2">상담 처리 <i class="dot-unsaved"></i></label>
      </div>
    </div>

    <div class="nd-body">
      <div class="nd-cols">
        <div class="nd-col">
          <div class="nd-colhead">고객 정보 <em>· 요청·현장·기록</em></div>

          <div class="nd-card">
            <div class="nd-card-h">
              <b>요청 내용</b><span class="tail">고객이 직접 쓴 문장</span>
            </div>
            <div class="nd-quote">${r.Detail ? escapeHtml(r.Detail) : '<span style="color:#cbd2da">접수내용 없음</span>'}</div>
          </div>

          <div class="nd-card">
            <div class="nd-card-h"><b>현장</b></div>
            <div class="nd-grid">
              <div class="nd-f">
                <b>공간</b><span${spaceText ? "" : ' class="empty"'}>${escapeHtml(spaceText || "미입력")}</span>
              </div>
              <div class="nd-f">
                <b>희망 일정</b><span${r.Schedule ? "" : ' class="empty"'}>${escapeHtml(r.Schedule || "미입력")}</span>
              </div>
              <div class="nd-f nd-wide">
                <b>주소</b><span${addressText ? "" : ' class="empty"'}>${escapeHtml(addressText || "미입력")}</span>
              </div>
            </div>
            ${
              attachments.length
                ? `<div class="nd-attach">
                     <b>첨부 ${attachments.length}</b>
                     ${attachments
                       .map(
                         (u) =>
                           `<a class="nd-file" href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer">${escapeHtml(fileLabel(u))}</a>`,
                       )
                       .join("")}
                   </div>`
                : ""
            }
          </div>

          ${
            formRows
              ? `<div class="nd-card">
                   <div class="nd-card-h">
                     <b>폼 응답</b><span class="tail">고객이 입력양식에 답한 원문</span>
                   </div>
                   <dl class="nd-kv">${formRows}</dl>
                 </div>`
              : ""
          }

          <div class="nd-card">
            <div class="nd-card-h"><b>메모</b><span class="tail">내부용</span></div>
            <div class="memo-thread" id="memoThread">
              ${memoCache[id] ? memoThreadHtml(memoCache[id]) : '<div class="memo-empty">불러오는 중...</div>'}
            </div>
            <div class="memo-editor">
              <textarea id="memoInput" placeholder="새 메모를 입력하세요 (Ctrl+Enter 저장)"></textarea>
              <div class="memo-editor-row">
                <input type="text" id="memoAuthor" placeholder="작성자 (선택)" style="width:140px;padding:6px 8px;border:1px solid var(--c-border);border-radius:6px;font-size:12px;" />
                <button class="btn btn-primary" id="btnAddMemo" type="button">메모 추가</button>
              </div>
            </div>
          </div>
        </div>

        <div class="nd-col work">
          <div class="nd-colhead">상담 처리 <em>· 일정·담당·계약</em></div>

          <div class="nd-card">
            <div class="nd-card-h"><b>상담 관리</b></div>
            <div class="est-manage-grid">
              <div class="field">
                <label>상태</label>
                <select id="editStatus">
                  ${statusOptions(r.Status)}
                </select>
              </div>
              <div class="field">
                <label>담당자</label>
                <input type="text" id="editAssignee" value="${escapeHtml(r.Assignee || "")}" />
              </div>
              <div class="field">
                <label>첫 연락 일시</label>
                <input type="datetime-local" id="editContactedAt" value="${(r.ContactedAt || "").slice(0, 16)}" />
              </div>
              <div class="field">
                <label>상담 예약 일시</label>
                <input type="datetime-local" id="editConsultAt" value="${(r.ConsultAt || "").slice(0, 16)}" />
              </div>
              <p class="nd-sync">
                📅 저장하면 <b>일정관리 캘린더</b>에 자동으로 올라가고
                <b>데이원디자인 일정관리</b> 채널로 알림이 갑니다. 비우면
                캘린더에서도 지워집니다.
              </p>
              <div class="field">
                <label>상담 지점</label>
                <select id="editConsultBranch">
                  <option value="">미정</option>
                  ${CONSULT_BRANCHES.map(
                    (b) =>
                      `<option value="${escapeHtml(b)}"${r.ConsultBranch === b ? " selected" : ""}>${escapeHtml(b)}</option>`,
                  ).join("")}
                  ${
                    r.ConsultBranch && !CONSULT_BRANCHES.includes(r.ConsultBranch)
                      ? `<option value="${escapeHtml(r.ConsultBranch)}" selected>${escapeHtml(r.ConsultBranch)}</option>`
                      : ""
                  }
                </select>
              </div>
            </div>
            <div class="nd-contract">${contractPanelHtml(r)}</div>
          </div>
        </div>
      </div>

      <div class="nd-folds">
        ${
          inflowCount
            ? `<details class="nd-fold nd-fold-inflow">
                 <summary>
                   <span>
                     <span class="lb">유입 경로</span>
                     <span class="nd-hint">${inflowCount}항목 · 경로와 검색어</span>
                   </span>
                 </summary>
                 <div class="in"><dl class="nd-kv">${inflowRows}</dl></div>
               </details>`
            : ""
        }
        <details class="nd-fold nd-fold-history">
          <summary>
            <span>
              <span class="lb">변경 이력 · 방문 히스토리</span>
              <span class="nd-hint">상태 변경과 첫 진입 → 폼 제출 흐름</span>
            </span>
          </summary>
          <div class="in">
            <div id="historyBox">${historyHtml(history)}</div>
            <div class="visit-history-thread" id="visitHistoryThread" style="margin-top:10px">
              <div class="visit-history-empty">불러오는 중...</div>
            </div>
          </div>
        </details>
      </div>
    </div>

    <div class="nd-savebar">
      <span class="hint" id="saveHint">고치면 여기에 알려 드립니다</span>
      <span class="sp"></span>
      <button class="btn btn-primary" id="btnPatch">상담 정보 저장</button>
    </div>
  `;

  openModal(detailModal);

  // 고친 것이 있으면 저장 바와 탭에 표시한다 — 좁은 화면에서는 다른 탭으로
  // 넘어가면 고친 칸이 화면에서 사라지므로 점으로 알린다
  const markDirty = () => {
    detail.classList.add("has-unsaved");
    const hint = detail.querySelector("#saveHint");
    if (hint) {
      hint.textContent = "변경한 내용이 있습니다";
      hint.classList.add("on");
    }
  };
  detail
    .querySelectorAll(".nd-col.work input, .nd-col.work select")
    .forEach((el) => {
      el.addEventListener("change", markDirty);
      el.addEventListener("input", markDirty);
    });

  detail.querySelector("#btnCopyContact")?.addEventListener("click", () => {
    const text = [r.Phone, r.Email].filter(Boolean).join(" / ");
    if (!text) return;
    navigator.clipboard
      ?.writeText(text)
      .then(() => adminUtil.toast("연락처를 복사했습니다"))
      .catch(() => adminUtil.toast("복사하지 못했습니다", "error"));
  });

  // 계약 입력칸은 '계약완료 처리' 를 누른 뒤에만 펼친다. 펼친 상태에서 저장하면
  // 상태가 계약완료로 바뀐다(doPatch 가 data-open 을 보고 판단한다).
  detail.querySelector("#btnContractOpen")?.addEventListener("click", () => {
    const panel = detail.querySelector("#contractPanel");
    const body = panel?.querySelector(".est-contract-body");
    if (!panel || !body) return;
    panel.dataset.open = "1";
    body.hidden = false;
    const at = detail.querySelector("#editContractAt");
    // 계약일은 대개 오늘이라 비어 있으면 지금 시각을 넣어 준다(수정 가능).
    if (at && !at.value) {
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      at.value = now.toISOString().slice(0, 16);
    }
    detail.querySelector("#btnContractOpen")?.setAttribute("hidden", "");
    at?.focus();
  });
  detail.querySelector("#btnContractCancel")?.addEventListener("click", () => {
    const panel = detail.querySelector("#contractPanel");
    if (!panel) return;
    panel.dataset.open = "0";
    adminUtil.toast("계약 해제 상태입니다. 저장을 눌러야 반영됩니다.");
  });
  detail
    .querySelector("#btnPatch")
    .addEventListener("click", () => doPatch(id));
  detail
    .querySelector("#btnAddMemo")
    .addEventListener("click", () => addMemo(id));
  detail.querySelector("#memoInput").addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      addMemo(id);
    }
  });
  bindMemoActions(id);

  // 메모 + 회차 + 방문 히스토리 병렬 로드
  if (!memoCache[id]) loadMemos(id);
  if (!historyCache[id]) loadHistory(id);
  loadVisitHistory(id);
}

const visitHistoryCache = {};

function visitHistoryHtml(payload) {
  if (!payload || !payload.events || !payload.events.length) {
    return `<div class="visit-history-empty">방문 이력이 없습니다 (SessionId 미수집 또는 첫 page_view 이전 폼 제출)</div>`;
  }
  const events = payload.events;
  return `<ol class="visit-history-list">${events
    .map((ev, i) => {
      const t = Date.parse(ev.createdAt);
      const time = isNaN(t) ? "" : fmtDateTime(ev.createdAt);
      const isFirst = i === 0;
      const refHost = (() => {
        try {
          return ev.referrer ? new URL(ev.referrer).hostname : "";
        } catch {
          return ev.referrer || "";
        }
      })();
      const fromLabel = ev.utmSource
        ? `utm: ${escapeHtml(ev.utmSource)}${ev.utmCampaign ? " · " + escapeHtml(ev.utmCampaign) : ""}`
        : refHost
          ? `referrer: ${escapeHtml(refHost)}`
          : "직접 방문";
      const loc = [ev.city, ev.country].filter(Boolean).join(" · ");
      return `<li class="visit-history-item ${isFirst ? "is-first" : ""}">
        <span class="visit-time">${escapeHtml(time)}</span>
        <span class="visit-page">${escapeHtml(ev.page || "/")}</span>
        <span class="visit-from">${fromLabel}</span>
        <span class="visit-meta">${escapeHtml(ev.device || "")}${loc ? " · " + escapeHtml(loc) : ""}</span>
      </li>`;
    })
    .join("")}</ol>`;
}

async function loadVisitHistory(id) {
  const slot = detail?.querySelector("#visitHistoryThread");
  if (!slot) return;
  try {
    if (visitHistoryCache[id]) {
      slot.innerHTML = visitHistoryHtml(visitHistoryCache[id]);
      return;
    }
    const data = await adminUtil.api(`/api/estimates/${id}/visit-history`);
    visitHistoryCache[id] = data;
    slot.innerHTML = visitHistoryHtml(data);
  } catch (e) {
    slot.innerHTML = `<div class="visit-history-empty">불러오기 실패</div>`;
  }
}

async function doPatch(id) {
  const btn = detail.querySelector("#btnPatch");
  btn.disabled = true;
  const payload = {
    Status: detail.querySelector("#editStatus").value,
    Assignee: detail.querySelector("#editAssignee").value.trim(),
  };
  // 계약 패널이 펼쳐져 있으면 계약으로 저장한다. 상태 드롭다운에는 계약완료가
  // 없으므로 여기서만 그 상태가 붙는다. 해제하면 접수 흐름으로 되돌린다.
  const contractPanel = detail.querySelector("#contractPanel");
  if (contractPanel) {
    if (contractPanel.dataset.open === "1") {
      const at = detail.querySelector("#editContractAt").value;
      payload.Status = CONTRACT_STATUS;
      payload.ContractAt = at ? new Date(at).toISOString() : "";
      payload.ContractOwner = detail
        .querySelector("#editContractOwner")
        .value.trim();
      payload.ContractAmount =
        Number(detail.querySelector("#editContractAmount").value) || 0;
    } else if (payload.Status === CONTRACT_STATUS) {
      // 계약을 해제했는데 상태가 계약완료로 남으면 집계가 어긋난다.
      payload.Status = "접수대기";
      payload.ContractAt = "";
      payload.ContractOwner = "";
      payload.ContractAmount = 0;
    }
  }
  const ca = detail.querySelector("#editContactedAt").value;
  if (ca) payload.ContactedAt = new Date(ca).toISOString();
  // 예약을 지우는 것도 저장이라 빈 값이면 빈 문자열을 보낸다 — if 로 감싸면
  // 한 번 잡힌 예약을 화면에서 비워도 서버에 남는다.
  const consultAt = detail.querySelector("#editConsultAt").value;
  payload.ConsultAt = consultAt ? new Date(consultAt).toISOString() : "";
  payload.ConsultBranch = detail.querySelector("#editConsultBranch").value;
  try {
    const d = await adminUtil.api(`/api/estimates/${id}`, {
      method: "PATCH",
      json: payload,
    });
    adminUtil.cacheInvalidate("/api/estimates");
    const r = records.find((x) => x.id === id);
    Object.assign(r, d.updated);
    render();
    // 머리의 상태 뱃지와 예약 띠를 새 값으로 바꾼다. 예약을 고쳤으면 띠의
    // 날짜와 D-day 도 같이 따라가야 한다
    const row1 = detail.querySelector(".nd-row1");
    const oldBadge = row1?.querySelector(".badge");
    if (oldBadge) oldBadge.outerHTML = statusBadge(payload.Status);
    const band = detail.querySelector(".nd-book");
    if (band) band.outerHTML = consultBandHtml(r);
    detail.classList.remove("has-unsaved");
    const hint = detail.querySelector("#saveHint");
    if (hint) {
      hint.textContent = "저장했습니다";
      hint.classList.remove("on");
    }
    adminUtil.toast("저장 완료");
  } catch (e) {
    adminUtil.toast("저장 실패: " + e.message, "error");
  } finally {
    btn.disabled = false;
  }
}

async function doSaveCustomer(id) {
  const btn = customerForm?.querySelector("#btnSaveCustomer");
  if (!customerForm || !btn) return;
  btn.disabled = true;
  const val = (sel) => customerForm.querySelector(sel)?.value?.trim() ?? "";
  const name = val("#cName");
  const phone = val("#cPhone");
  if (!name || !phone) {
    adminUtil.toast("이름·연락처는 필수입니다", "error");
    btn.disabled = false;
    return;
  }
  const payload = {
    Name: name,
    Phone: phone,
    Email: val("#cEmail"),
    SpaceType: val("#cSpaceType"),
    SpaceSize: val("#cSpaceSize"),
    Postcode: val("#cPostcode"),
    Address: val("#cAddress"),
    AddressDetail: val("#cAddressDetail"),
    Schedule: val("#cSchedule"),
    Branch: val("#cBranch"),
    Referral: val("#cReferral"),
    Detail: customerForm.querySelector("#cDetail")?.value ?? "",
  };
  try {
    const d = await adminUtil.api(`/api/estimates/${id}`, {
      method: "PATCH",
      json: payload,
    });
    adminUtil.cacheInvalidate("/api/estimates");
    const r = records.find((x) => x.id === id);
    Object.assign(r, d.updated);
    render();
    closeCustomerModal();
    openDetail(id);
    adminUtil.toast("고객 정보 저장 완료");
  } catch (e) {
    adminUtil.toast("저장 실패: " + e.message, "error");
  } finally {
    if (btn.isConnected) btn.disabled = false;
  }
}

// 상세 화면에서 삭제 버튼을 뺐다(2026-09-03 요청) — 상담 관리 중에 잘못 눌러
// 고객 기록이 사라지는 쪽이 더 큰 위험이다. 서버 DELETE 는 그대로 살아 있으니
// 삭제가 필요하면 이 함수를 부르는 버튼을 다시 달면 된다.
async function doDelete(id, name) {
  const label = name ? `"${name}"` : "이 접수 건";
  if (
    !confirm(
      `${label}을(를) 영구 삭제합니다.\n메모/이력/첨부파일 정보는 복구할 수 없습니다.\n계속할까요?`,
    )
  )
    return;
  const btn = detail.querySelector("#btnDelete");
  const patchBtn = detail.querySelector("#btnPatch");
  btn.disabled = true;
  if (patchBtn) patchBtn.disabled = true;
  try {
    await adminUtil.api(`/api/estimates/${id}`, { method: "DELETE" });
    adminUtil.cacheInvalidate("/api/estimates");
    records = records.filter((x) => x.id !== id);
    selectedId = null;
    closeCustomerModal();
    closeDetailModal();
    detail.innerHTML = "";
    render();
    adminUtil.toast("삭제 완료");
  } catch (e) {
    adminUtil.toast("삭제 실패: " + e.message, "error");
    btn.disabled = false;
    if (patchBtn) patchBtn.disabled = false;
  }
}

// -- memos ----------------------------------------------------

async function loadMemos(id) {
  try {
    const d = await adminUtil.api(`/api/estimates/${id}/memos`);
    memoCache[id] = d.memos || [];
  } catch (e) {
    memoCache[id] = [];
  }
  if (selectedId === id) {
    const thread = detail.querySelector("#memoThread");
    if (thread) thread.innerHTML = memoThreadHtml(memoCache[id]);
    bindMemoActions(id);
  }
}

async function loadHistory(id) {
  try {
    const d = await adminUtil.api(`/api/estimates/${id}/history`);
    historyCache[id] = d;
  } catch {
    historyCache[id] = { sessionNo: 1, previous: [] };
  }
  if (selectedId === id) {
    const slot = detail.querySelector("#detailSessionSlot");
    if (slot)
      slot.innerHTML = sessionBadgeHtml(historyCache[id]?.sessionNo || 1);
    const historyBox = detail.querySelector("#historyBox");
    if (historyBox) historyBox.innerHTML = historyHtml(historyCache[id]);
  }
}

async function addMemo(id) {
  const input = detail.querySelector("#memoInput");
  const authorEl = detail.querySelector("#memoAuthor");
  const text = input.value.trim();
  if (!text) return;
  const author = authorEl.value.trim();
  try {
    const d = await adminUtil.api(`/api/estimates/${id}/memos`, {
      method: "POST",
      json: { body: text, author },
    });
    memoCache[id] = [...(memoCache[id] || []), d.memo];
    detail.querySelector("#memoThread").innerHTML = memoThreadHtml(
      memoCache[id],
    );
    bindMemoActions(id);
    input.value = "";
    adminUtil.toast("메모 추가됨");
  } catch (e) {
    adminUtil.toast("메모 저장 실패: " + e.message, "error");
  }
}

function bindMemoActions(id) {
  const thread = detail.querySelector("#memoThread");
  if (!thread) return;
  thread.querySelectorAll(".memo-item").forEach((el) => {
    const mid = el.dataset.memoId;
    el.querySelectorAll(".memo-actions button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const act = btn.dataset.act;
        if (act === "edit") editMemoInline(id, mid, el);
        if (act === "del") deleteMemo(id, mid);
      });
    });
  });
}

function editMemoInline(estimateId, memoId, el) {
  const memo = (memoCache[estimateId] || []).find((m) => m.id === memoId);
  if (!memo) return;
  el.innerHTML = `
    <div class="memo-editor">
      <textarea data-role="edit-body">${escapeHtml(memo.body)}</textarea>
      <div class="memo-editor-row">
        <button class="btn" data-act="cancel" type="button">취소</button>
        <button class="btn btn-primary" data-act="save" type="button">저장</button>
      </div>
    </div>
  `;
  const ta = el.querySelector("textarea");
  ta.focus();
  el.querySelector('[data-act="cancel"]').addEventListener("click", () => {
    el.outerHTML = memoItemHtml(memo);
    bindMemoActions(estimateId);
  });
  el.querySelector('[data-act="save"]').addEventListener("click", async () => {
    const text = ta.value.trim();
    if (!text) return;
    try {
      const d = await adminUtil.api(
        `/api/estimates/${estimateId}/memos/${memoId}`,
        { method: "PATCH", json: { body: text } },
      );
      memoCache[estimateId] = memoCache[estimateId].map((m) =>
        m.id === memoId ? d.memo : m,
      );
      detail.querySelector("#memoThread").innerHTML = memoThreadHtml(
        memoCache[estimateId],
      );
      bindMemoActions(estimateId);
      adminUtil.toast("메모 수정됨");
    } catch (e) {
      adminUtil.toast("수정 실패: " + e.message, "error");
    }
  });
}

async function deleteMemo(estimateId, memoId) {
  if (!confirm("이 메모를 삭제하시겠습니까?")) return;
  try {
    await adminUtil.api(`/api/estimates/${estimateId}/memos/${memoId}`, {
      method: "DELETE",
    });
    memoCache[estimateId] = (memoCache[estimateId] || []).filter(
      (m) => m.id !== memoId,
    );
    detail.querySelector("#memoThread").innerHTML = memoThreadHtml(
      memoCache[estimateId],
    );
    bindMemoActions(estimateId);
    adminUtil.toast("메모 삭제됨");
  } catch (e) {
    adminUtil.toast("삭제 실패: " + e.message, "error");
  }
}

// -- init -----------------------------------------------------

filterStatus.addEventListener("change", render);
if (sourceTabs) {
  sourceTabs.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-source-tab]");
    if (!btn) return;
    sourceTabKey = btn.dataset.sourceTab || "";
    sourceTabs.querySelectorAll("[data-source-tab]").forEach((b) => {
      const on = b === btn;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    render();
  });
}
if (periodSeg) {
  periodSeg.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-period]");
    if (!btn) return;
    const period = btn.dataset.period;
    applyPeriod(period);
    setActivePeriod(period);
    togglePeriodPicker(period);
    render();
  });
}
filterSearch.addEventListener("input", render);
// 날짜 입력은 '선택기간' 일 때만 노출되므로 여기서 세그 상태를 건드릴 일이 없다
if (filterFrom) filterFrom.addEventListener("change", render);
if (filterTo) filterTo.addEventListener("change", render);
if (btnExportCsv) btnExportCsv.addEventListener("click", exportFilteredCsv);

(async () => {
  await adminUtil.ensureAuth();
  adminUtil.pingApi();
  try {
    adminUtil.cacheInvalidate("/api/estimates");
    const d = await adminUtil.api("/api/estimates");
    records = d.records || [];
    render();
  } catch (e) {
    body.innerHTML = `<div class="empty-state">로드 실패: ${escapeHtml(e.message)}</div>`;
  }
  const logoutBtn = document.getElementById("btnLogout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        await adminUtil.api("/api/auth/logout", { method: "POST" });
      } catch {}
      adminUtil.clearToken();
      location.href = "login.html";
    });
  }
})();

// ========== SMS (LMS) 발송 모달 ==========
function utf8ByteLength(s) {
  return new TextEncoder().encode(String(s || "")).length;
}

function updateSmsCounters() {
  if (smsSubjectLen)
    smsSubjectLen.textContent = String((smsSubject?.value || "").length);
  if (smsContentLen)
    smsContentLen.textContent = String((smsContent?.value || "").length);
  if (smsContentBytes)
    smsContentBytes.textContent = String(utf8ByteLength(smsContent?.value));
}

smsSubject?.addEventListener("input", updateSmsCounters);
smsContent?.addEventListener("input", updateSmsCounters);

async function loadSmsTemplatesOnce() {
  if (smsTemplatesCache) return smsTemplatesCache;
  try {
    const data = await adminUtil.api("/api/sms/templates");
    smsTemplatesCache = data.records || [];
  } catch (e) {
    smsTemplatesCache = [];
    adminUtil.toast("템플릿 목록 로드 실패: " + (e.message || ""), "error");
  }
  return smsTemplatesCache;
}

function fillSmsTemplateOptions(list) {
  if (!smsTemplate) return;
  smsTemplate.innerHTML =
    '<option value="">— 직접 작성 —</option>' +
    list
      .map(
        (t) =>
          `<option value="${escapeHtml(t.id)}">${escapeHtml(t.Name || "이름 없음")}</option>`,
      )
      .join("");
}

smsTemplate?.addEventListener("change", () => {
  const id = smsTemplate.value;
  if (!id || !smsTemplatesCache) return;
  const tpl = smsTemplatesCache.find((t) => t.id === id);
  if (!tpl) return;
  smsSubject.value = tpl.Subject || "";
  smsContent.value = tpl.Content || "";
  updateSmsCounters();
});

async function openSmsModal(estimateId) {
  const r = records.find((x) => x.id === estimateId);
  if (!r) return;
  smsForm.dataset.estimateId = estimateId;
  smsTo.value = r.Phone || "";
  smsSubject.value = "";
  smsContent.value = "";
  if (smsTemplate) smsTemplate.value = "";
  updateSmsCounters();
  if (smsHint) smsHint.hidden = true;

  // 템플릿 로딩은 모달 띄운 뒤 비동기
  openModal(smsModal);
  setTimeout(() => smsTo.focus(), 30);
  const list = await loadSmsTemplatesOnce();
  fillSmsTemplateOptions(list);
}

smsForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const estimateId = smsForm.dataset.estimateId || "";
  const to = (smsTo.value || "").replace(/\D/g, "");
  const subject = (smsSubject.value || "").trim();
  const content = (smsContent.value || "").replace(/\r\n/g, "\n").trim();
  if (!/^010\d{7,8}$/.test(to)) {
    adminUtil.toast("올바른 전화번호를 입력하세요 (010으로 시작)", "warn");
    return;
  }
  if (!subject) {
    adminUtil.toast("제목을 입력하세요.", "warn");
    return;
  }
  if (!content) {
    adminUtil.toast("본문을 입력하세요.", "warn");
    return;
  }
  const btn = document.getElementById("btnSendSmsSubmit");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "발송 중...";
  }
  try {
    const res = await adminUtil.api("/api/sms/send", {
      method: "POST",
      json: {
        to,
        subject,
        content,
        estimateId,
        templateId: smsTemplate?.value || "",
      },
    });
    if (res.status === "sent") {
      adminUtil.toast("문자를 발송했습니다.");
      closeSmsModal();
    } else if (res.status === "skipped") {
      if (smsHint) {
        smsHint.hidden = false;
        smsHint.textContent =
          "발신번호 검수 대기 중이라 실제 문자는 전송되지 않았습니다. 이력에는 기록됩니다. (사유: " +
          (res.detail || "") +
          ")";
      }
      adminUtil.toast("검수 통과 전 — 실제 전송 없이 이력만 기록", "warn");
    } else {
      adminUtil.toast("발송 실패: " + (res.detail || "알 수 없음"), "error");
    }
  } catch (e) {
    adminUtil.toast("발송 요청 실패: " + (e.message || ""), "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "발송";
    }
  }
});
