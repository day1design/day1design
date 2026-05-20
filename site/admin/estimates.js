// ========== 상담신청 관리 ==========
let records = [];
let selectedId = null;
let memoCache = {}; // { estimateId: [memos] }
let historyCache = {}; // { estimateId: history }

const body = document.getElementById("estBody");
const detail = document.getElementById("estDetail");
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
const filterSource = document.getElementById("filterSource");
const filterSearch = document.getElementById("filterSearch");
const filterFrom = document.getElementById("filterFrom");
const filterTo = document.getElementById("filterTo");
const btnExportCsv = document.getElementById("btnExportCsv");
const statDaily = document.getElementById("statDaily");
const statWeekly = document.getElementById("statWeekly");
const statMonthly = document.getElementById("statMonthly");

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

function sourceBadge(src) {
  const s = String(src || "homepage").toLowerCase();
  // 드롭다운 필터(estimates.html)의 옵션 라벨과 1:1 일치
  const labels = {
    homepage: "홈페이지",
    meta: "Meta 광고",
    google: "Google",
    naver: "Naver",
    youtube: "YouTube",
    kakao: "Kakao",
    referral: "Referral",
    other: "기타",
  };
  const key = labels[s] ? s : "other";
  return `<span class="src-badge src-${key}">${escapeHtml(labels[key])}</span>`;
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

function fmtInt(n) {
  return Number(n || 0).toLocaleString("ko-KR");
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function renderQuickStats() {
  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 6);
  const monthStart = new Date(
    todayStart.getFullYear(),
    todayStart.getMonth(),
    1,
  );
  let daily = 0;
  let weekly = 0;
  let monthly = 0;

  for (const r of records) {
    const ts = Date.parse(r.SubmittedAt || "");
    if (!Number.isFinite(ts) || ts > now.getTime()) continue;
    if (ts >= todayStart.getTime()) daily++;
    if (ts >= weekStart.getTime()) weekly++;
    if (ts >= monthStart.getTime()) monthly++;
  }

  if (statDaily) statDaily.textContent = fmtInt(daily);
  if (statWeekly) statWeekly.textContent = fmtInt(weekly);
  if (statMonthly) statMonthly.textContent = fmtInt(monthly);
}

function filtered() {
  const st = filterStatus.value;
  const src = filterSource ? filterSource.value : "";
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
    if (src) {
      const s = (r.Source || "homepage").toLowerCase();
      if (s !== src) return false;
    }
    if (fromTs || toTs) {
      const t = Date.parse(r.SubmittedAt || "");
      if (isNaN(t)) return false;
      if (fromTs && t < fromTs) return false;
      if (toTs && t > toTs) return false;
    }
    if (q) {
      const hay =
        `${r.Name} ${r.Phone} ${r.Address} ${r.Email} ${r.Campaign || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// ===== CSV 다운로드 (UTF-8 BOM, 엑셀 호환) =====
const SOURCE_LABELS_EXPORT = {
  homepage: "홈페이지",
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
    "상태",
    "담당자",
    "메모",
    "유입경로",
  ];
  const rows = list.map((r) => {
    const srcKey = (r.Source || "homepage").toLowerCase();
    return [
      r.SubmittedAt || "",
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
      r.Status || "",
      r.Assignee || "",
      r.Memo || "",
      r.Referral || "",
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

function detailTitleHtml(r, sessionNo) {
  return `
    <span class="detail-name">${escapeHtml(r.Name || "이름 없음")}</span>
    ${sourceBadge(r.Source)}
    <span id="detailSessionSlot">${sessionBadgeHtml(sessionNo)}</span>
    <span class="branch-chip">${escapeHtml(r.Branch || "지점 미지정")}</span>
    <span class="detail-title-note">${escapeHtml(briefText(r))}</span>`;
}

function render() {
  renderQuickStats();
  const list = filtered();
  if (!list.length) {
    body.innerHTML = '<div class="empty-state">접수 내역이 없습니다.</div>';
    return;
  }
  const sessionMap = buildSessionMap(records);
  const groups = [];
  for (const r of list) {
    const submittedDate = (r.SubmittedAt || "").slice(0, 10) || "날짜 없음";
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
        <span>
          <b>유입</b>
          <em>${sourceBadge(r.Source)} ${sessionBadgeHtml(sessionNo)}</em>
        </span>
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

  detail.innerHTML = `
    <div class="detail-head">
      <div>
        <h2>
          ${detailTitleHtml(r, sessionNo)}
        </h2>
        <div class="detail-sub">${fmtDateTime(r.SubmittedAt)} · IP ${escapeHtml(r.IP || "—")}</div>
      </div>
      ${statusBadge(r.Status)}
    </div>

    <div class="est-detail-grid">
      <section class="est-info-panel est-info-main">
        <h3>접수 정보</h3>
        <dl class="detail-dl">
          <dt>연락처</dt><dd>${escapeHtml(r.Phone || "—")}</dd>
          <dt>이메일</dt><dd>${escapeHtml(r.Email || "—")}</dd>
          <dt>공간</dt><dd>${escapeHtml(r.SpaceType || "—")} ${r.SpaceSize ? "· " + escapeHtml(r.SpaceSize) : ""}</dd>
          <dt>주소/지역</dt><dd>${escapeHtml(r.Postcode || "")} ${escapeHtml(r.Address || "")} ${escapeHtml(r.AddressDetail || "")}</dd>
          <dt>일정</dt><dd>${escapeHtml(r.Schedule || "—")}</dd>
          <dt>경로</dt><dd>${escapeHtml(r.Referral || "—")}</dd>
          ${
            (r.Source || "").toLowerCase() === "meta"
              ? `
          <dt>Meta 플랫폼</dt><dd>${escapeHtml(r.Platform || "—")}</dd>
          <dt>Meta 캠페인</dt><dd>${escapeHtml(r.Campaign || "—")}</dd>
        `
              : ""
          }
          <dt>상세내용</dt><dd><div class="detail-note">${escapeHtml(r.Detail || "—")}</div></dd>
          <dt>컨셉파일</dt><dd>${filesList(r.ConceptFiles)}</dd>
          <dt>평면도</dt><dd>${filesList(r.FloorPlans)}</dd>
          <dt>지점</dt><dd>${escapeHtml(r.Branch || "—")}</dd>
        </dl>
      </section>

      <section class="est-info-panel est-manage-panel">
        <h3>상담 관리</h3>
        <div class="est-manage-grid">
          <div class="field">
            <label>상태</label>
            <select id="editStatus">
              ${[
                "고객 부재중",
                "진행불가 (예산/범위/지역/일정등)",
                "전화상담 후 미진행",
                "전화상담 후 미팅예약",
                "전화상담 후 대기중",
                "보류",
              ]
                .map(
                  (s) =>
                    `<option ${r.Status === s ? "selected" : ""}>${s}</option>`,
                )
                .join("")}
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
            <label>견적 금액 (원)</label>
            <input type="number" id="editAmount" min="0" value="${r.EstimateAmount || 0}" />
          </div>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" id="btnPatch">상담 정보 저장</button>
          <button class="btn btn-danger" id="btnDelete" type="button">고객 삭제</button>
        </div>
      </section>

      <section class="est-info-panel est-history-panel" id="historyBox">
        ${historyHtml(history)}
      </section>

      <section class="est-info-panel est-memo-panel">
        <h3>메모</h3>
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
      </section>
    </div>

  `;

  openModal(detailModal);
  detail
    .querySelector("#btnPatch")
    .addEventListener("click", () => doPatch(id));
  detail
    .querySelector("#btnDelete")
    .addEventListener("click", () => doDelete(id, r.Name));
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

  // 메모 + 회차 병렬 로드
  if (!memoCache[id]) loadMemos(id);
  if (!historyCache[id]) loadHistory(id);
}

async function doPatch(id) {
  const btn = detail.querySelector("#btnPatch");
  btn.disabled = true;
  const payload = {
    Status: detail.querySelector("#editStatus").value,
    Assignee: detail.querySelector("#editAssignee").value.trim(),
    EstimateAmount: Number(detail.querySelector("#editAmount").value) || 0,
  };
  const ca = detail.querySelector("#editContactedAt").value;
  if (ca) payload.ContactedAt = new Date(ca).toISOString();
  try {
    const d = await adminUtil.api(`/api/estimates/${id}`, {
      method: "PATCH",
      json: payload,
    });
    adminUtil.cacheInvalidate("/api/estimates");
    const r = records.find((x) => x.id === id);
    Object.assign(r, d.updated);
    render();
    // 상세 head 의 상태뱃지만 교체
    const dh = detail.querySelector(".detail-head");
    if (dh) {
      const oldBadge = dh.querySelector(".badge");
      if (oldBadge) oldBadge.outerHTML = statusBadge(payload.Status);
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
if (filterSource) filterSource.addEventListener("change", render);
filterSearch.addEventListener("input", render);
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
