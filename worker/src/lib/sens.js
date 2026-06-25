// ─── Naver Cloud SENS (SMS/LMS) 발송 헬퍼 ───
// 검수 통과 + 발신번호 등록 전에는 NCP_SENS_FROM_NUMBER 가 비어있어
// sendNcpSens 가 { ok:false, skipped:true } 로 즉시 리턴되므로
// 라우트 코드에서 try/catch 없이 호출해도 안전.
//
// 필요 env:
//   NCP_SENS_ACCESS_KEY     ncp_iam_...
//   NCP_SENS_SECRET_KEY     ncp_iam_...
//   NCP_SENS_SERVICE_ID     ncp:sms:kr:{projectId}:day1design (URN 전체)
//   NCP_SENS_FROM_NUMBER    01012345678 (등록 발신번호, 검수 후 채움)

const SENS_BASE = "https://sens.apigw.ntruss.com";
const SMS_BYTE_LIMIT = 90; // 이하 SMS, 초과 LMS

function utf8ByteLength(s) {
  return new TextEncoder().encode(String(s || "")).length;
}

function pickSmsType(content) {
  return utf8ByteLength(content) <= SMS_BYTE_LIMIT ? "SMS" : "LMS";
}

function normalizePhone(p) {
  return String(p || "").replace(/\D/g, "");
}

async function hmacSha256Base64(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  let bin = "";
  const view = new Uint8Array(sig);
  for (let i = 0; i < view.length; i++) bin += String.fromCharCode(view[i]);
  return btoa(bin);
}

function buildSignature({ method, url, timestamp, accessKey, secretKey }) {
  const message = `${method} ${url}\n${timestamp}\n${accessKey}`;
  return hmacSha256Base64(secretKey, message);
}

function readSensEnv(env) {
  return {
    accessKey: String(env.NCP_SENS_ACCESS_KEY || "").trim(),
    secretKey: String(env.NCP_SENS_SECRET_KEY || "").trim(),
    serviceId: String(env.NCP_SENS_SERVICE_ID || "").trim(),
    from: normalizePhone(env.NCP_SENS_FROM_NUMBER),
  };
}

// 검수 통과 / 발신번호 등록 전에는 skipped:true 로 안전 리턴.
// 운영 시점 디버그용으로 reason 도 같이.
//   type: "LMS" | "SMS" | "auto"(default) — auto 는 본문 길이 기준 자동 선택
export async function sendNcpSens(
  env,
  { to, content, subject, type: forcedType = "auto" } = {},
) {
  const { accessKey, secretKey, serviceId, from } = readSensEnv(env);
  const cleanTo = normalizePhone(to);

  if (!accessKey || !secretKey || !serviceId) {
    return { ok: false, skipped: true, reason: "sens-env-missing" };
  }
  if (!from) {
    return { ok: false, skipped: true, reason: "from-number-not-registered" };
  }
  if (!cleanTo) {
    return { ok: false, skipped: true, reason: "invalid-to" };
  }
  if (!content) {
    return { ok: false, skipped: true, reason: "empty-content" };
  }

  const path = `/sms/v2/services/${serviceId}/messages`;
  const timestamp = String(Date.now());
  const signature = await buildSignature({
    method: "POST",
    url: path,
    timestamp,
    accessKey,
    secretKey,
  });

  const type =
    forcedType === "LMS" || forcedType === "SMS"
      ? forcedType
      : pickSmsType(content);
  const payload = {
    type,
    contentType: "COMM",
    countryCode: "82",
    from,
    content,
    messages: [{ to: cleanTo }],
  };
  if (type === "LMS" && subject) {
    payload.subject = String(subject).slice(0, 40);
  }

  const res = await fetch(`${SENS_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "x-ncp-apigw-timestamp": timestamp,
      "x-ncp-iam-access-key": accessKey,
      "x-ncp-apigw-signature-v2": signature,
    },
    body: JSON.stringify(payload),
  });

  let bodyText = "";
  try {
    bodyText = await res.text();
  } catch {}

  return {
    ok: res.ok,
    status: res.status,
    body: bodyText.slice(0, 500),
    type,
  };
}

// ─── 메시지 템플릿 ───
// 접수확인 LMS 본문. 채널(홈페이지/인스타그램/페이스북)만 인트로 3줄이 다르고
// 주소/링크/맺음말은 공통. 두 지점(강남·판교) 정보는 항상 함께 표기(지점 분기 없음).
// 본문 변경은 여기서만.
export const CUSTOMER_SMS_SUBJECT = "[데이원디자인] 상담 접수 확인";

const ADDRESS_BLOCK = [
  "[데이원 사무실 주소]",
  "강남본점 : 강남구 논현로 562 역삼동 동극빌딩 2층(건물 기계식 주차 가능 -무료)",
  "판교점 : 분당구 판교공원로1길 22-1, 1층(건물 앞 주차가능)",
  "https://naver.me/FpwVn9Ta",
].join("\n");

// 채널별 인트로(접수 경로 안내) — 이 3줄만 채널마다 다름
const CHANNEL_INTRO = {
  homepage: [
    "홈페이지의 견적문의 메뉴를 통해",
    "작성해주신 양식이 정상적으로",
    "접수되었습니다.",
  ],
  instagram: [
    "인스타그램 잠재고객 양식폼을 통해",
    "작성해주신 상담문의가 정상적으로",
    "접수되었습니다.",
  ],
  facebook: [
    "페이스북 잠재고객 양식폼을 통해",
    "작성해주신 상담문의가 정상적으로",
    "접수되었습니다.",
  ],
};

// channel: "homepage" | "instagram" | "facebook" (미상은 homepage)
export function buildCustomerSms(channel = "homepage") {
  const intro = CHANNEL_INTRO[channel] || CHANNEL_INTRO.homepage;
  return [
    "※※상담 접수 확인※※",
    "안녕하세요 고객님,",
    "[데이원디자인]입니다.",
    "",
    ...intro,
    "",
    "접수 문의를 확인하는대로 담당 매니저가 고객님께",
    "연락드려 전화상담을 진행할 예정입니다.",
    "",
    "감사합니다.",
    "",
    ADDRESS_BLOCK,
    "",
    "***홈페이지 안내***",
    "https://day1design.co.kr/",
  ].join("\n");
}
