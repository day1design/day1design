// ================================================
// 데이원디자인 - Meta 리드 웹훅 처리 시스템
// 웹앱 배포 버전 - 2026.02.27 (컬럼 순서 수정 + 이메일 리디자인)
// ================================================

const CONFIG = {
  SPREADSHEET_ID: '1V2xNjQZPJUskHoARMRLnyVdXGFcFsdM6-H7ihDNEMcA',
  EMAIL: {
    TO: 'gahyun.co@gmail.com',
    BCC: 'mkt@polarad.co.kr',
    SUBJECT_PREFIX: '[데이원디자인] '
  },
  WEBHOOK_SECRET: 'dayonedesign2025secret'
};

// ✅ 수정: 실제 시트 헤더 순서에 맞게 수정 (D=지역, E=이름, F=연락처)
const COLUMN_MAP = {
  timestamp: 1,      // A열: 접수일시
  campaign: 2,       // B열: 캠페인
  platform: 3,       // C열: 플랫폼
  location: 4,       // D열: 지역
  name: 5,           // E열: 이름
  phone: 6,          // F열: 연락처
  spaceType: 7,      // G열: 공간유형
  area: 8,           // H열: 면적
  scheduledDate: 9,  // I열: 시공예정일
  emailStatus: 10    // J열: 이메일발송상태
};

// ===== 웹앱 엔트리 포인트 =====
function doPost(e) {
  try {
    console.log('=== 웹훅 수신 ===');
    console.log('이벤트 데이터:', JSON.stringify(e));

    const secret = e.parameter.secret || e.headers?.['X-Webhook-Secret'];
    if (secret && secret !== CONFIG.WEBHOOK_SECRET) {
      console.error('보안 토큰 불일치');
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Unauthorized'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    let data;
    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e.parameter) {
      data = e.parameter;
    } else {
      throw new Error('No data received');
    }

    console.log('파싱된 데이터:', JSON.stringify(data));

    const result = processLead(data);

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: 'Lead processed successfully',
      result: result
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    console.error('웹훅 처리 오류:', error);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ===== 리드 처리 메인 함수 =====
function processLead(data) {
  console.log('=== 리드 처리 시작 ===');

  const rowNumber = saveToSheet(data);
  console.log(`✅ 스프레드시트 저장 완료: ${rowNumber}번 행`);

  const emailSent = sendEmailNotification(data, rowNumber);
  updateEmailStatus(rowNumber, emailSent);

  return { rowNumber: rowNumber, emailSent: emailSent };
}

// ===== 스프레드시트 저장 =====
function saveToSheet(data) {
  const sheet = getSheet();

  const koreaTime = new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });

  // ✅ 수정: 실제 시트 컬럼 순서 (D=지역, E=이름, F=연락처)
  const rowData = [
    koreaTime,                         // A: 접수일시
    data.campaign || '',               // B: 캠페인
    data.platform || 'Meta',           // C: 플랫폼
    data.location || '',               // D: 지역  ← 수정
    data.name || '',                   // E: 이름  ← 수정
    normalizePhoneNumber(data.phone),  // F: 연락처 ← 수정
    data.spaceType || '',              // G: 공간유형
    data.area || '',                   // H: 면적
    data.scheduledDate || '',          // I: 시공예정일
    '대기'                             // J: 이메일발송상태
  ];

  sheet.appendRow(rowData);
  const lastRow = sheet.getLastRow();
  console.log(`데이터 저장 완료: ${lastRow}번 행`);
  return lastRow;
}

// ===== 이메일 발송 =====
function sendEmailNotification(data, rowNumber) {
  try {
    const subject = `${CONFIG.EMAIL.SUBJECT_PREFIX}새 상담 신청 — ${safeString(data.name)} / ${safeString(data.location)}`;

    const receivedAt = new Date().toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${CONFIG.SPREADSHEET_ID}/edit#gid=0&range=${rowNumber}:${rowNumber}`;

    const htmlBody = `
<div style="font-family: -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; max-width: 580px; margin: 0 auto; background: #ffffff;">

  <!-- 헤더 -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #1a1a1a;">
    <tr>
      <td style="padding: 18px 32px; font-size: 15px; font-weight: 300; color: #ffffff; letter-spacing: 5px; text-transform: uppercase;">Day One Design</td>
      <td style="padding: 18px 32px; font-size: 10px; color: #666666; letter-spacing: 2px; text-transform: uppercase; text-align: right; white-space: nowrap;">Consultation Alert</td>
    </tr>
  </table>

  <!-- 배너 -->
  <div style="background: #f5f0e8; border-left: 3px solid #c8a96e; padding: 9px 24px; font-size: 12px; color: #6b5b3e; letter-spacing: 0.3px;">
    새로운 인테리어 상담 신청이 접수되었습니다 — ${receivedAt}
  </div>

  <!-- 본문 -->
  <div style="padding: 24px 28px 20px;">

    <!-- Client -->
    <p style="font-size: 10px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: #777777; margin: 0 0 10px 0; padding-bottom: 7px; border-bottom: 1px solid #f0f0f0;">Client</p>
    <p style="margin: 0 0 18px 0; line-height: 1.4;">
      <span style="font-size: 20px; font-weight: 400; color: #1a1a1a; letter-spacing: 0.5px;">${safeString(data.name)}</span>
      &nbsp;&nbsp;
      <span style="font-size: 14px; color: #c8a96e; font-weight: 500; letter-spacing: 0.5px;">${normalizePhoneNumber(data.phone)}</span>
      &nbsp;&nbsp;
      <span style="font-size: 12px; color: #666666; letter-spacing: 0.3px;">${safeString(data.location)}</span>
    </p>

    <!-- Project -->
    <p style="font-size: 10px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: #777777; margin: 0 0 10px 0; padding-bottom: 7px; border-bottom: 1px solid #f0f0f0;">Project</p>
    <table width="100%" cellpadding="0" cellspacing="1" style="background: #f0f0f0; border-radius: 2px; margin-bottom: 16px;">
      <tr>
        <td width="33%" style="background: #ffffff; padding: 10px 14px;">
          <p style="font-size: 9px; font-weight: 600; letter-spacing: 1.2px; text-transform: uppercase; color: #888888; margin: 0 0 3px 0;">공간유형</p>
          <p style="font-size: 13px; color: #1a1a1a; margin: 0;">${safeString(data.spaceType)}</p>
        </td>
        <td width="33%" style="background: #ffffff; padding: 10px 14px;">
          <p style="font-size: 9px; font-weight: 600; letter-spacing: 1.2px; text-transform: uppercase; color: #888888; margin: 0 0 3px 0;">면적</p>
          <p style="font-size: 13px; color: #1a1a1a; margin: 0;">${safeString(data.area)}</p>
        </td>
        <td width="34%" style="background: #ffffff; padding: 10px 14px;">
          <p style="font-size: 9px; font-weight: 600; letter-spacing: 1.2px; text-transform: uppercase; color: #888888; margin: 0 0 3px 0;">시공예정일</p>
          <p style="font-size: 13px; color: #c8a96e; font-weight: 500; margin: 0;">${safeString(data.scheduledDate)}</p>
        </td>
      </tr>
    </table>

    <!-- Source + CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background: #fafafa; border-radius: 2px;">
      <tr>
        <td style="padding: 10px 14px;">
          <span style="font-size: 9px; letter-spacing: 1px; color: #888888; text-transform: uppercase;">Platform</span>
          <span style="font-size: 12px; color: #333333; margin-left: 6px;">${safeString(data.platform)}</span>
          &nbsp;&nbsp;&nbsp;
          <span style="font-size: 9px; letter-spacing: 1px; color: #888888; text-transform: uppercase;">Campaign</span>
          <span style="font-size: 12px; color: #333333; margin-left: 6px;">${safeString(data.campaign)}</span>
        </td>
        <td style="padding: 10px 14px; text-align: right; white-space: nowrap;">
          <a href="${sheetUrl}" style="display: inline-block; background: #1a1a1a; color: #ffffff; text-decoration: none; padding: 8px 18px; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 500; border-radius: 2px;">시트 확인</a>
        </td>
      </tr>
    </table>

  </div>

  <!-- 푸터 -->
  <div style="background: #fafafa; border-top: 1px solid #f0f0f0; padding: 12px 28px; text-align: center;">
    <p style="font-size: 10px; color: #888888; margin: 0; line-height: 1.6; letter-spacing: 0.3px;">데이원디자인 자동 알림 · gahyun.co@gmail.com</p>
  </div>

</div>`;

    const plainBody = `[데이원디자인] 새 상담 신청

이름: ${safeString(data.name)}
연락처: ${normalizePhoneNumber(data.phone)}
지역: ${safeString(data.location)}
공간유형: ${safeString(data.spaceType)}
면적: ${safeString(data.area)}
시공예정일: ${safeString(data.scheduledDate)}
캠페인: ${safeString(data.campaign)}
플랫폼: ${safeString(data.platform)}
접수: ${receivedAt}

스프레드시트: ${sheetUrl}`;

    MailApp.sendEmail({
      to: CONFIG.EMAIL.TO,
      bcc: CONFIG.EMAIL.BCC,
      subject: subject,
      body: plainBody,
      htmlBody: htmlBody
    });

    console.log(`✅ 이메일 발송 성공: ${CONFIG.EMAIL.TO}`);
    return true;

  } catch (error) {
    console.error('❌ 이메일 발송 실패:', error);
    return false;
  }
}

// ===== 이메일 상태 업데이트 =====
function updateEmailStatus(rowNumber, emailSent) {
  try {
    const sheet = getSheet();
    const currentTime = new Date().toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const status = emailSent
      ? `✅ 발송완료_${currentTime}`
      : `❌ 발송실패_${currentTime}`;
    sheet.getRange(rowNumber, COLUMN_MAP.emailStatus).setValue(status);
    console.log(`이메일 상태 기록: ${status}`);
  } catch (error) {
    console.error('상태 업데이트 실패:', error);
  }
}

// ===== 헬퍼 함수 =====
function getSheet() {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheets()[0];
}

function normalizePhoneNumber(phone) {
  if (!phone) return '';
  phone = String(phone).trim().replace(/^\+82/, '');
  if (!phone.startsWith('0')) phone = '0' + phone;
  phone = phone.replace(/[^0-9]/g, '');
  if (phone.length === 11 && phone.startsWith('010')) {
    return phone.slice(0, 3) + '-' + phone.slice(3, 7) + '-' + phone.slice(7);
  }
  return phone;
}

function safeString(value) {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

// ===== 테스트 함수 =====
function testWebhook() {
  const testData = {
    campaign: '2025 인테리어 캠페인',
    platform: 'Meta',
    name: '김테스트',
    phone: '010-1234-5678',
    location: '서울 강남구',
    spaceType: '아파트',
    area: '30평',
    scheduledDate: '2025년 3월'
  };
  console.log('=== 테스트 시작 ===');
  const result = processLead(testData);
  console.log('처리 결과:', JSON.stringify(result));
  return result;
}

// ===== 웹앱 GET 요청 (테스트 페이지) =====
function doGet(e) {
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>데이원디자인 웹훅 테스트</title>
<style>
body{font-family:'Apple SD Gothic Neo',sans-serif;background:#1a1a1a;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box;}
.card{background:#fff;padding:36px;border-radius:4px;max-width:460px;width:100%;}
h1{font-size:18px;font-weight:300;letter-spacing:4px;text-transform:uppercase;margin:0 0 4px;color:#1a1a1a;}
.sub{font-size:10px;letter-spacing:2px;color:#999;text-transform:uppercase;margin:0 0 28px;}
label{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#888;display:block;margin-bottom:5px;}
input,select{width:100%;padding:9px 12px;border:1px solid #e8e8e8;border-radius:2px;font-size:13px;margin-bottom:16px;box-sizing:border-box;background:#fafafa;}
button{width:100%;background:#1a1a1a;color:#fff;border:none;padding:12px;font-size:11px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;border-radius:2px;}
#result{margin-top:16px;padding:14px;background:#fafafa;border-radius:2px;display:none;font-size:13px;}
</style></head>
<body><div class="card">
<h1>Day One Design</h1>
<p class="sub">Webhook Test</p>
<form id="f">
<label>이름</label><input name="name" value="김테스트">
<label>연락처</label><input name="phone" value="010-1234-5678">
<label>지역</label><input name="location" value="서울 강남구">
<label>공간유형</label>
<select name="spaceType"><option>아파트</option><option>빌라/연립</option><option>단독주택</option><option>상가/사무실</option></select>
<label>면적</label>
<select name="area"><option>10평 미만</option><option>10-20평</option><option>20-30평</option><option>30-40평</option><option>40-50평</option><option>50평 이상</option></select>
<label>시공예정일</label>
<select name="scheduledDate"><option>즉시</option><option>1개월 이내</option><option>2-3개월 이내</option><option>3-6개월 이내</option><option>6개월 이후</option><option>미정</option></select>
<button type="submit">테스트 전송</button>
</form>
<div id="result"></div>
</div>
<script>
document.getElementById('f').onsubmit=async(e)=>{
  e.preventDefault();
  const r=document.getElementById('result');
  r.style.display='block';r.innerHTML='처리 중...';
  const d=Object.fromEntries(new FormData(e.target));
  d.platform='Meta';d.campaign='테스트 캠페인';
  try{
    const res=await fetch(window.location.href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});
    const j=await res.json();
    r.innerHTML=j.success?'✅ 성공 — 행 '+j.result.rowNumber:'❌ 실패: '+j.error;
  }catch(err){r.innerHTML='❌ '+err.message;}
};
</script></body></html>`;
  return HtmlService.createHtmlOutput(html);
}
