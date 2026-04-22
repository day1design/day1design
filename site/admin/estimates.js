// ========== 상담신청 관리 ==========
let records = [];
let selectedId = null;
let memoCache = {}; // { estimateId: [memos] }
let historyCache = {}; // { estimateId: history }

const body = document.getElementById("estBody");
const detail = document.getElementById("estDetail");
const filterStatus = document.getElementById("filterStatus");
const filterSource = document.getElementById("filterSource");
const filterSearch = document.getElementById("filterSearch");

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
  };
  return `<span class="${map[s] || "badge"}">${escapeHtml(s || "—")}</span>`;
}

function sourceBadge(src) {
  const s = String(src || "homepage").toLowerCase();
  if (s === "meta") return `<span class="src-badge src-meta">Meta</span>`;
  return `<span class="src-badge src-homepage">홈페이지</span>`;
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

function filtered() {
  const st = filterStatus.value;
  const src = filterSource ? filterSource.value : "";
  const q = filterSearch.value.trim().toLowerCase();
  return records.filter((r) => {
    if (st && r.Status !== st) return false;
    if (src) {
      const s = (r.Source || "homepage").toLowerCase();
      if (s !== src) return false;
    }
    if (q) {
      const hay =
        `${r.Name} ${r.Phone} ${r.Address} ${r.Email} ${r.Campaign || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function render() {
  const list = filtered();
  if (!list.length) {
    body.innerHTML =
      '<tr><td colspan="7" class="empty-state">접수 내역이 없습니다.</td></tr>';
    return;
  }
  body.innerHTML = list
    .map((r) => {
      const typeSize = [r.SpaceType, r.SpaceSize].filter(Boolean).join(" / ");
      const sub = r.Email || r.Campaign || "";
      return `
    <tr data-id="${r.id}" class="${r.id === selectedId ? "is-selected" : ""}">
      <td data-label="접수일">${escapeHtml((r.SubmittedAt || "").slice(0, 10))}</td>
      <td data-label="출처">${sourceBadge(r.Source)}</td>
      <td data-label="이름">
        <div class="cell-title">${escapeHtml(r.Name || "")}</div>
        ${sub ? `<small class="cell-sub">${escapeHtml(sub)}</small>` : ""}
      </td>
      <td data-label="연락처">${escapeHtml(r.Phone || "")}</td>
      <td data-label="유형/평수">${escapeHtml(typeSize)}</td>
      <td data-label="지점">${escapeHtml(r.Branch || "")}</td>
      <td data-label="상태">${statusBadge(r.Status)}</td>
    </tr>`;
    })
    .join("");
  body.querySelectorAll("tr").forEach((tr) => {
    tr.addEventListener("click", () => openDetail(tr.dataset.id));
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

async function openDetail(id) {
  const r = records.find((x) => x.id === id);
  if (!r) return;
  selectedId = id;
  render();

  detail.innerHTML = `
    <div class="detail-head">
      <div>
        <h2>${escapeHtml(r.Name)} ${sourceBadge(r.Source)}</h2>
        <div class="detail-sub">${fmtDateTime(r.SubmittedAt)} · IP ${escapeHtml(r.IP || "—")}</div>
      </div>
      ${statusBadge(r.Status)}
    </div>

    <div id="historyBox">${historyHtml(historyCache[id])}</div>

    <dl class="detail-dl">
      <dt>연락처</dt><dd>${escapeHtml(r.Phone)}</dd>
      <dt>이메일</dt><dd>${escapeHtml(r.Email || "—")}</dd>
      <dt>공간</dt><dd>${escapeHtml(r.SpaceType || "—")} ${r.SpaceSize ? "· " + escapeHtml(r.SpaceSize) : ""}</dd>
      <dt>주소/지역</dt><dd>${escapeHtml(r.Postcode || "")} ${escapeHtml(r.Address || "")} ${escapeHtml(r.AddressDetail || "")}</dd>
      <dt>일정</dt><dd>${escapeHtml(r.Schedule || "—")}</dd>
      <dt>경로</dt><dd>${escapeHtml(r.Referral || "—")}</dd>
      <dt>지점</dt><dd>${escapeHtml(r.Branch || "—")}</dd>
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
    </dl>

    <div class="admin-panel">
      <h3>고객 정보 수정</h3>
      <p class="panel-hint">상담 후 확인된 실제 정보로 업데이트하세요. 저장 시 접수 내역에 즉시 반영됩니다.</p>
      <div class="field-row-2">
        <div class="field">
          <label>이름</label>
          <input type="text" id="cNamE" value="${escapeHtml(r.Name || "")}" />
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
        <textarea id="cDetail" rows="4">${escapeHtml(r.Detail || "")}</textarea>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" id="btnSaveCustomer" type="button">고객 정보 저장</button>
      </div>
    </div>

    <div class="admin-panel">
      <h3>상담 관리</h3>
      <div class="field">
        <label>상태</label>
        <select id="editStatus">
          ${["접수대기", "상담중", "견적완료", "계약완료", "취소"]
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
      <div class="form-actions">
        <button class="btn btn-primary" id="btnPatch">상담 정보 저장</button>
        <button class="btn btn-danger" id="btnDelete" type="button">
          고객 삭제
        </button>
      </div>
    </div>

    <div class="admin-panel">
      <h3>메모 (쓰레드)</h3>
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

  `;

  detail
    .querySelector("#btnPatch")
    .addEventListener("click", () => doPatch(id));
  detail
    .querySelector("#btnSaveCustomer")
    .addEventListener("click", () => doSaveCustomer(id));
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
  const btn = detail.querySelector("#btnSaveCustomer");
  btn.disabled = true;
  const val = (sel) => detail.querySelector(sel)?.value?.trim() ?? "";
  const name = val("#cNamE");
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
    Detail: detail.querySelector("#cDetail")?.value ?? "",
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
    // 상세 head 이름 업데이트
    const head = detail.querySelector(".detail-head h2");
    if (head) head.innerHTML = `${escapeHtml(r.Name)} ${sourceBadge(r.Source)}`;
    adminUtil.toast("고객 정보 저장 완료");
  } catch (e) {
    adminUtil.toast("저장 실패: " + e.message, "error");
  } finally {
    btn.disabled = false;
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
    detail.innerHTML =
      '<div class="empty-state">좌측 목록에서 접수 건을 선택하세요.</div>';
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
    const hb = detail.querySelector("#historyBox");
    if (hb) hb.innerHTML = historyHtml(historyCache[id]);
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

(async () => {
  await adminUtil.ensureAuth();
  adminUtil.pingApi();
  try {
    const d = await adminUtil.apiCached("/api/estimates", { ttl: 30_000 });
    records = d.records || [];
    render();
  } catch (e) {
    body.innerHTML = `<tr><td colspan="7" class="empty-state">로드 실패: ${escapeHtml(e.message)}</td></tr>`;
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
