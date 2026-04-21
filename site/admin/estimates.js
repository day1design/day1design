// ========== 상담신청 관리 ==========
let records = [];
let selectedId = null;

const body = document.getElementById("estBody");
const detail = document.getElementById("estDetail");
const filterStatus = document.getElementById("filterStatus");
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

function filtered() {
  const st = filterStatus.value;
  const q = filterSearch.value.trim().toLowerCase();
  return records.filter((r) => {
    if (st && r.Status !== st) return false;
    if (q) {
      const hay = `${r.Name} ${r.Phone} ${r.Address} ${r.Email}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function render() {
  const list = filtered();
  if (!list.length) {
    body.innerHTML =
      '<tr><td colspan="6" class="empty-state">접수 내역이 없습니다.</td></tr>';
    return;
  }
  body.innerHTML = list
    .map(
      (r) => `
    <tr data-id="${r.id}" class="${r.id === selectedId ? "is-selected" : ""}">
      <td>${escapeHtml((r.SubmittedAt || "").slice(0, 10))}</td>
      <td>
        <div class="cell-title">${escapeHtml(r.Name)}</div>
        <small class="cell-sub">${escapeHtml(r.Email || "")}</small>
      </td>
      <td>${escapeHtml(r.Phone)}</td>
      <td>${escapeHtml(r.SpaceType)} / ${escapeHtml(r.SpaceSize)}</td>
      <td>${escapeHtml(r.Branch)}</td>
      <td>${statusBadge(r.Status)}</td>
    </tr>`,
    )
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

function openDetail(id) {
  const r = records.find((x) => x.id === id);
  if (!r) return;
  selectedId = id;
  render();
  detail.innerHTML = `
    <div class="detail-head">
      <div>
        <h2>${escapeHtml(r.Name)}</h2>
        <div class="detail-sub">${adminUtil.fmtDate(r.SubmittedAt)} · IP ${escapeHtml(r.IP || "—")}</div>
      </div>
      ${statusBadge(r.Status)}
    </div>

    <dl class="detail-dl">
      <dt>연락처</dt><dd>${escapeHtml(r.Phone)}</dd>
      <dt>이메일</dt><dd>${escapeHtml(r.Email)}</dd>
      <dt>공간</dt><dd>${escapeHtml(r.SpaceType)} · ${escapeHtml(r.SpaceSize)}</dd>
      <dt>주소</dt><dd>${escapeHtml(r.Postcode)} ${escapeHtml(r.Address)} ${escapeHtml(r.AddressDetail)}</dd>
      <dt>일정</dt><dd>${escapeHtml(r.Schedule || "—")}</dd>
      <dt>경로</dt><dd>${escapeHtml(r.Referral || "—")}</dd>
      <dt>지점</dt><dd>${escapeHtml(r.Branch || "—")}</dd>
      <dt>상세내용</dt><dd><div class="detail-note">${escapeHtml(r.Detail || "—")}</div></dd>
      <dt>컨셉파일</dt><dd>${filesList(r.ConceptFiles)}</dd>
      <dt>평면도</dt><dd>${filesList(r.FloorPlans)}</dd>
    </dl>

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
      <div class="field">
        <label>메모</label>
        <textarea id="editMemo" rows="4">${escapeHtml(r.Memo || "")}</textarea>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" id="btnPatch">변경사항 저장</button>
      </div>
    </div>
  `;
  detail
    .querySelector("#btnPatch")
    .addEventListener("click", () => doPatch(id));
}

async function doPatch(id) {
  const btn = detail.querySelector("#btnPatch");
  btn.disabled = true;
  const payload = {
    Status: detail.querySelector("#editStatus").value,
    Assignee: detail.querySelector("#editAssignee").value.trim(),
    Memo: detail.querySelector("#editMemo").value,
    EstimateAmount: Number(detail.querySelector("#editAmount").value) || 0,
  };
  const ca = detail.querySelector("#editContactedAt").value;
  if (ca) payload.ContactedAt = new Date(ca).toISOString();
  try {
    const d = await adminUtil.api(`/api/estimates/${id}`, {
      method: "PATCH",
      json: payload,
    });
    const r = records.find((x) => x.id === id);
    Object.assign(r, d.updated);
    render();
    openDetail(id);
    adminUtil.toast("저장 완료");
  } catch (e) {
    adminUtil.toast("저장 실패: " + e.message, "error");
  } finally {
    btn.disabled = false;
  }
}

filterStatus.addEventListener("change", render);
filterSearch.addEventListener("input", render);

(async () => {
  await adminUtil.ensureAuth();
  adminUtil.pingApi();
  try {
    const d = await adminUtil.api("/api/estimates");
    records = d.records || [];
    render();
  } catch (e) {
    body.innerHTML = `<tr><td colspan="6" class="empty-state">로드 실패: ${escapeHtml(e.message)}</td></tr>`;
  }
  document.getElementById("btnLogout").addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      await adminUtil.api("/api/auth/logout", { method: "POST" });
    } catch {}
    adminUtil.clearToken();
    location.href = "login.html";
  });
})();
