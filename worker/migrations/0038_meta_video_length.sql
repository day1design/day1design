-- 영상 길이를 붙여 "25% 지점"을 초로 말할 수 있게 한다.
--
-- p25/p50/p75 는 시간이 아니라 영상 길이 대비 비율이다. 그래서 길이를 모르면
-- 30초 영상의 25%(7.5초)와 10초 영상의 25%(2.5초)를 같은 칸에 놓고 비교하게 된다.
-- 평균 시청 3.4초가 "3초 만에 다 떠났다"인지 "짧은 영상이라 정상"인지도 가릴 수 없다.
--
-- 길이는 광고가 아니라 영상에 붙는 속성이라 별도 테이블에 둔다. 같은 영상을 여러 광고가
-- 쓰므로, 한 번 조회하면 계속 재사용해 Graph 호출을 아낀다.

ALTER TABLE MetaAdsAd ADD COLUMN VideoId TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS MetaVideos (
  VideoId TEXT PRIMARY KEY,
  LengthSec REAL DEFAULT 0,
  Title TEXT DEFAULT '',
  FetchedAt TEXT DEFAULT '',
  CreatedAt TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_metaadsad_videoid ON MetaAdsAd (VideoId);
