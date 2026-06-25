// ─── 실시간 작동로그(접수 이벤트) 기록 ───
// 접수 1건마다 IntakeEvents 1행: 채널/지점/위치 + 단계별(d1·lms·telegram·email·capi) ok|skip|fail.
// 개인정보 최소화: 이름·연락처는 마스킹해서만 저장.

export function maskName(name) {
  const s = String(name || "").trim();
  if (!s) return "";
  if (s.length === 1) return s;
  return s[0] + "○".repeat(s.length - 1);
}

export function maskPhone(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length < 7) return d ? d.slice(0, 3) + "****" : "";
  return `${d.slice(0, 3)}-****-${d.slice(-4)}`;
}

// 단계 결과 → 종합. fail 하나라도 = fail, skip = warn, 전부 ok = ok.
export function overallOf(steps) {
  const vals = Object.values(steps || {});
  if (vals.includes("fail")) return "fail";
  if (vals.includes("skip")) return "warn";
  return "ok";
}

// 접수 이벤트 1행 기록. 알림/통계 부수효과이므로 실패해도 접수에 영향 없게 swallow.
export async function logIntakeEvent(services, ev = {}) {
  try {
    const steps = ev.steps || {};
    await services.intakeEvents.create({
      At: ev.at || new Date().toISOString(),
      Channel: String(ev.channel || ""),
      Source: String(ev.source || ""),
      Branch: String(ev.branch || ""),
      RefName: maskName(ev.name),
      RefPhone: maskPhone(ev.phone),
      Geo: String(ev.geo || ""),
      EstimateId: String(ev.estimateId || ""),
      Steps: JSON.stringify(steps),
      Overall: ev.overall || overallOf(steps),
      IP: String(ev.ip || ""),
    });
  } catch {
    // 기록 실패는 무시 (접수 본 기능에 영향 금지)
  }
}
