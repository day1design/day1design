const HOMEPAGE_FIELDS = Object.freeze([
  ["name", "이름"], ["phone", "연락처"], ["email", "이메일"], ["space_type", "공간 유형"],
  ["space_size", "공간 규모"], ["address", "주소"], ["address_detail", "상세 주소"],
  ["schedule", "희망 일정"], ["referral", "유입 경로"], ["branch", "희망 지점"],
  ["detail", "문의 내용"], ["budget", "가용 예산"],
]);
const MAX_ANSWERS = 14;
const MAX_TEXT = 5000;

function valueText(value) {
  if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join(", ").slice(0, MAX_TEXT);
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return "";
  return String(value).trim().slice(0, MAX_TEXT);
}

function normalizedAnswer(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const question = valueText(item.q ?? item.question);
  const answer = valueText(item.a ?? item.answer ?? item.values);
  const field = valueText(item.f ?? item.field).slice(0, 200);
  if (!question && !answer && !field) return null;
  return { question, answer, field };
}

function parseOriginal(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function serializeHomepageAnswers(fields = {}) {
  return HOMEPAGE_FIELDS.map(([field, question]) => {
    const answer = valueText(fields?.[field]);
    return answer ? { question, answer, field } : null;
  }).filter(Boolean).slice(0, MAX_ANSWERS);
}

function budgetTextDetail(row) {
  const detail = valueText(row?.Detail);
  const match = /가용\s*예산[^:\n\r]*[:：]\s*([^\n\r]*)/i.exec(detail);
  if (match?.[1]?.trim()) return match[1].trim().slice(0, MAX_TEXT);
  const amount = valueText(row?.EstimateAmount);
  return amount && amount !== "0" ? amount : "";
}

export function crmOriginalAnswers(row = {}) {
  const captured = parseOriginal(row.MetaFieldData).slice(0, 100).map(normalizedAnswer).filter(Boolean);
  if (captured.length) return { answers: captured, source: "captured" };
  if (!valueText(row.MetaLeadId)) {
    const answers = serializeHomepageAnswers({
      name: row.Name, phone: row.Phone, email: row.Email, space_type: row.SpaceType, space_size: row.SpaceSize,
      address: row.Address, address_detail: row.AddressDetail, schedule: row.Schedule, referral: row.Referral,
      branch: row.Branch, detail: row.Detail, budget: budgetTextDetail(row),
    });
    return { answers, source: "stored_fields" };
  }
  return { answers: [], source: "missing" };
}
