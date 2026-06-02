-- 0022: Meta 픽셀 기준 상호작용 이벤트 로그 (pixel_events)
-- 브라우저 비콘(common.js sendBeacon) + 서버 CAPI Lead 결과를 영속화.
-- 어드민 "픽셀 이벤트" 메뉴에서 KPI·일별추이·퍼널·소스·광고별·최근로그로 시각화.
-- 보존: PageView 포함 전량 기록 → D1 영구 저장(롤링 삭제 없음, 외부 비공개 내부분석용).
-- 광고별: 광고 URL 동적 파라미터(utm_campaign/content/term + utm_id={{ad.id}}, fbclid) 캡처.

CREATE TABLE IF NOT EXISTS pixel_events (
  id             TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL,             -- ISO 발생시각
  event_name     TEXT NOT NULL,            -- Meta 표준: PageView/ViewContent/Lead/Contact/InitiateCheckout/Search
  ga4_name       TEXT,                      -- 내부 이벤트: page_view/estimate_cta_click/phone_click/...
  channel        TEXT,                      -- pixel | capi | both
  event_id       TEXT,                      -- 중복제거 키(Lead)
  page_path      TEXT,
  source         TEXT,                      -- meta/naver/google/kakao/youtube/referral/homepage
  session_id     TEXT,
  -- 광고별 귀속 (광고 URL 동적 파라미터에서 캡처)
  campaign       TEXT,                      -- utm_campaign ({{campaign.name}})
  adset          TEXT,                      -- utm_content ({{adset.name}})
  ad             TEXT,                      -- utm_term ({{ad.name}})
  ad_id          TEXT,                      -- utm_id ({{ad.id}}) — meta-ads D1과 JOIN 키
  fbclid         TEXT,                      -- 클릭 식별자
  -- CAPI/개인정보
  capi_status    TEXT,                      -- sent|failed|skipped (Lead 한정)
  matched_fields TEXT,                      -- em,ph,client_ip_address,client_user_agent,fbp,fbc
  ip             TEXT,                      -- 서버수집(표 미노출)
  ua             TEXT
);

CREATE INDEX IF NOT EXISTS idx_pixel_events_created ON pixel_events(created_at);
CREATE INDEX IF NOT EXISTS idx_pixel_events_name ON pixel_events(event_name, created_at);
CREATE INDEX IF NOT EXISTS idx_pixel_events_session ON pixel_events(session_id);
CREATE INDEX IF NOT EXISTS idx_pixel_events_ad ON pixel_events(ad_id, created_at);
