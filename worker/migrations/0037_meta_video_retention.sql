-- 영상 광고의 시청 유지 곡선을 광고 단위로 남긴다.
--
-- 지금까지 광고별로는 ThruPlay 와 평균 시청초만 저장했다. 그 둘로는 "이 영상이
-- 초반에 죽는지, 중반에 빠지는지"를 알 수 없다. 영상 소재를 고치려면 어느 구간에서
-- 사람이 떠나는지가 필요한데, 그 정보가 API 응답에는 있었고 저장에서 버려지고 있었다.
--
-- 재생 시작(VideoPlays)과 2초 연속 재생(Video2SecViews)도 새로 받는다.
-- Meta 에서 후킹 성능은 이 둘의 비율로 본다 — 노출 대비 2초를 넘긴 비율이
-- 첫 화면이 붙잡았는지를 말해 준다.

ALTER TABLE MetaAdsAd ADD COLUMN VideoP25Watched INTEGER DEFAULT 0;
ALTER TABLE MetaAdsAd ADD COLUMN VideoP50Watched INTEGER DEFAULT 0;
ALTER TABLE MetaAdsAd ADD COLUMN VideoP75Watched INTEGER DEFAULT 0;
ALTER TABLE MetaAdsAd ADD COLUMN VideoP100Watched INTEGER DEFAULT 0;
ALTER TABLE MetaAdsAd ADD COLUMN VideoPlays INTEGER DEFAULT 0;
ALTER TABLE MetaAdsAd ADD COLUMN Video2SecViews INTEGER DEFAULT 0;

ALTER TABLE MetaAdsDaily ADD COLUMN VideoPlays INTEGER DEFAULT 0;
ALTER TABLE MetaAdsDaily ADD COLUMN Video2SecViews INTEGER DEFAULT 0;
