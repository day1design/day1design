import assert from "node:assert/strict";
import test from "node:test";

import { classifyTrafficSource } from "../src/routes/analytics.js";

const ch = (source, medium = "") =>
  classifyTrafficSource({ source, medium, channelGroup: "" }).key;

// [가드] 마케팅 슬러그는 UtmSource 에 한글 라벨을 그대로 심는다.
// 판별 정규식이 영문만 보던 동안 이 유입이 전량 '기타' 로 떨어졌다 —
// 2026-09-03 실측에서 기타 66.7% 중 94% 가 "메타-트래픽-캠페인" 한 값이었다.
// [가드] 슬러그를 만드는 deriveUtm 이 normalize("NFKD") 를 걸어서 D1 에는 한글
// 자모가 분해된 값이 저장된다("메타" U+BA54 U+D0C0 → U+1106 U+1166 U+1110 U+1161).
// 조합형으로 쓴 정규식은 분해형에 절대 안 걸린다 — 실제로 이것 때문에 분류를
// 고치고 배포한 뒤에도 기타가 그대로였다. 판별 전에 NFC 로 합치는지 못박는다.
test("[가드] 자모가 분해된(NFKD) 한글 슬러그도 알아본다", () => {
  const decomposed = (s) => s.normalize("NFKD");
  assert.notEqual(decomposed("메타-트래픽-캠페인"), "메타-트래픽-캠페인");
  assert.equal(ch(decomposed("메타-트래픽-캠페인"), "marketing-slug"), "meta_ad");
  assert.equal(ch(decomposed("네이버-블로그-견적문의"), "marketing-slug"), "naver");
  assert.equal(ch(decomposed("인스타그램-마케팅"), "organic"), "instagram_mkt");
  assert.equal(ch(decomposed("유튜브-쇼츠"), "marketing-slug"), "youtube");
});

test("[가드] 한글 UTM 슬러그를 채널로 알아본다", () => {
  assert.equal(ch("메타-트래픽-캠페인", "marketing-slug"), "meta_ad");
  assert.equal(ch("네이버-블로그-견적문의", "marketing-slug"), "naver");
  assert.equal(ch("인스타그램-마케팅", "organic"), "instagram_mkt");
  assert.equal(ch("인스타그램-오피셜", "organic"), "instagram_official");
  assert.equal(ch("유튜브-쇼츠", "marketing-slug"), "youtube");
  assert.equal(ch("카카오-채널", "marketing-slug"), "kakao");
  assert.equal(ch("구글-검색", "marketing-slug"), "google");
});

// Meta 광고는 게재면을 두 글자 코드로 심는다({{site_source_name}}).
// 짧아서 일반 정규식에 안 걸리므로 정확히 일치할 때만 본다.
test("[가드] Meta 게재면 코드를 광고 채널로 가른다", () => {
  assert.equal(ch("ig", "paid"), "instagram_ad");
  assert.equal(ch("fb", "paid"), "facebook_ad");
  assert.equal(ch("an", "paid"), "meta_ad");
  assert.equal(ch("msg", "paid"), "meta_ad");
  assert.equal(ch("th", "paid"), "threads");
  // 같은 소스라도 유료가 아니면 오가닉 채널로 남는다.
  assert.equal(ch("ig", "social"), "instagram");
});

test("AI 답변 엔진은 검색과 갈라 센다", () => {
  assert.equal(ch("chatgpt.com"), "ai");
  assert.equal(ch("claude.ai"), "ai");
  assert.equal(ch("www.perplexity.ai"), "ai");
  // gemini 는 google 분기보다 먼저 봐야 구글 검색으로 흡수되지 않는다.
  assert.equal(ch("gemini.google.com"), "ai");
  assert.equal(ch("www.google.com"), "google");
});

test("커뮤니티·채용·검색엔진을 각자 채널로 센다", () => {
  assert.equal(ch("m.dcinside.com"), "community");
  assert.equal(ch("loader.fmkorea.com"), "community");
  assert.equal(ch("namu.wiki"), "community");
  assert.equal(ch("www.saramin.co.kr"), "recruit");
  assert.equal(ch("www.jobkorea.co.kr"), "recruit");
  assert.equal(ch("www.bing.com"), "search");
  assert.equal(ch("search.yahoo.com"), "search");
});

test("네이버·구글 하위 도메인을 놓치지 않는다", () => {
  assert.equal(ch("m.search.naver.com"), "naver");
  assert.equal(ch("blog.naverblogwidget.com"), "naver");
  assert.equal(ch("booking-admin.sentinel.navercorp.com"), "naver");
  assert.equal(ch("com.google.android.googlequicksearchbox"), "google");
  assert.equal(ch("m.search.daum.net"), "kakao");
});

test("개발·내부 흔적은 외부 유입으로 세지 않는다", () => {
  assert.equal(ch("localhost"), "internal");
  assert.equal(ch("polaad-website.localhost"), "internal");
  assert.equal(ch("210.117.121.225"), "internal");
  assert.equal(ch("wg-sales-production.up.railway.app"), "internal");
});

// x.com 정규식에 경계가 없으면 wix.com 이 트위터로 잡힌다(실제로 겪은 오분류).
test("소셜 판별이 다른 도메인을 삼키지 않는다", () => {
  assert.equal(ch("www.pinterest.com"), "social");
  assert.equal(ch("manage.wix.com"), "referral");
});

// [가드] '기타' 는 정말 모르는 값만 남아야 한다.
// 알려진 채널이 아니어도 도메인 형태면 외부 유입(referral)으로 센다.
test("[가드] 도메인 형태는 기타로 떨어지지 않는다", () => {
  assert.equal(ch("polarad.co.kr"), "referral");
  assert.equal(ch("dailytodaily.com"), "referral");
  assert.equal(ch("crm.revu.net"), "referral");
  assert.equal(ch("unpa.me"), "referral");
  // 도메인도 아니고 아는 채널도 아닌 값만 기타다.
  assert.equal(ch("unknown-token"), "other");
});

// 자체 집계는 UTM 도 referrer 도 없을 때 '(none)' 을 넣는다. 곧 직접 유입인데
// direct 목록에 없어서 기타로 떨어지고 있었다.
test("[가드] 출처가 비면 직접 유입으로 센다", () => {
  assert.equal(ch("(none)"), "direct");
  assert.equal(ch("(not set)"), "direct");
  assert.equal(ch(""), "direct");
  assert.equal(ch("(direct)"), "direct");
});

// [가드] 라이브에서 실제로 관측된 출처 전체가 기타로 떨어지지 않아야 한다.
// 2026-09-03 기준 전체 기간 first-touch 목록에서 뽑았다.
test("[가드] 실측 출처 목록에 기타가 없다", () => {
  const observed = [
    ["ig", "paid"], ["메타-트래픽-캠페인", "marketing-slug"], ["fb", "paid"],
    ["m.search.naver.com", ""], ["www.google.com", ""], ["search.naver.com", ""],
    ["www.saramin.co.kr", ""], ["polarad.co.kr", ""], ["m.blog.naver.com", ""],
    ["m.dcinside.com", ""], ["an", "paid"], ["loader.fmkorea.com", ""],
    ["pcmap.place.naver.com", ""], ["namu.wiki", ""], ["www.youtube.com", ""],
    ["m.fmkorea.com", ""], ["blog.naver.com", ""],
    ["instagram-marketing", "organic"], ["m.place.naver.com", ""],
    ["www.facebook.com", ""], ["m.facebook.com", ""], ["www.jobkorea.co.kr", ""],
    ["chatgpt.com", ""], ["naver.com", ""], ["blog.naverblogwidget.com", ""],
    ["instagram-official", "organic"], ["l.instagram.com", ""],
    ["m.saramin.co.kr", ""], ["com.google.android.googlequicksearchbox", ""],
    ["www.google.co.kr", ""], ["gemini.google.com", ""],
    ["shield-ui.nsa-front-end.svc.pr1.io.navercorp.com", ""],
    ["www.bing.com", ""], ["l.facebook.com", ""], ["localhost", ""],
    ["m.newspic.kr", ""], ["crm.revu.net", ""], ["dailytodaily.com", ""],
    ["instagram.com", ""], ["search.yahoo.com", ""], ["th", "paid"],
    ["www.dogdrip.net", ""], ["www.fmkorea.com", ""], ["m.jobkorea.co.kr", ""],
    ["m.nate.com", ""], ["map.kakao.com", ""], ["unpa.me", ""],
    ["www.wishket.com", ""], ["210.117.121.225", ""],
    ["booking-admin.sentinel.navercorp.com", ""], ["claude.ai", ""],
    ["ig", "social"], ["images.search.yahoo.com", ""], ["link.naver.com", ""],
    ["m.cafe.naver.com", ""], ["m.humoruniv.com", ""], ["m.news.nate.com", ""],
    ["m.ruliweb.com", ""], ["m.search.daum.net", ""], ["m.youtube.com", ""],
    ["manage.wix.com", ""], ["mlbpark.donga.com", ""], ["perplexity", ""],
    ["polaad-website.localhost", ""], ["tstop.kr", ""],
    ["wg-sales-production.up.railway.app", ""], ["www.dmitory.com", ""],
    ["www.perplexity.ai", ""], ["www.pinterest.com", ""],
    ["www.thomasmarble.co.kr", ""], ["www.work24.go.kr", ""],
    ["네이버-블로그-견적문의", "marketing-slug"],
  ];
  const fellThrough = observed
    .filter(([src, med]) => ch(src, med) === "other")
    .map(([src]) => src);
  assert.deepEqual(fellThrough, []);
});

// 바이럴 채널 링크(매거진 랜딩 /lp/mag, utm_campaign gn-mag)는 utm_source 를 정확히
// viral-blog·viral-insta·viral-thread 로 싣는다(2026-11-21). 인스타·스레드·네이버 블로그
// 안에서 눌러도 바이럴로 세야 해서 Meta·네이버 판정보다 먼저 본다.
test("[가드] 바이럴 utm_source 3종은 정확히 일치하면 바이럴 채널로 센다", () => {
  const g = (source, medium, channelGroup) =>
    classifyTrafficSource({ source, medium, channelGroup }).key;
  assert.equal(ch("viral-blog"), "viral_blog");
  assert.equal(ch("viral-insta"), "viral_insta");
  assert.equal(ch("viral-thread"), "viral_threads");
  assert.equal(ch(" Viral-Insta "), "viral_insta", "대소문자·앞뒤 공백은 봐준다");
  // 인스타·스레드·네이버 블로그 단서가 매체·채널 그룹에 같이 실려도 바이럴이 이긴다
  assert.equal(g("viral-insta", "instagram.com", "Organic Social"), "viral_insta");
  assert.equal(g("viral-insta", "paid", "Paid Social"), "viral_insta");
  assert.equal(g("viral-thread", "www.threads.com", "Organic Social"), "viral_threads");
  assert.equal(g("viral-blog", "m.blog.naver.com", "Referral"), "viral_blog");
  assert.equal(
    classifyTrafficSource({ source: "viral-blog", medium: "", channelGroup: "" }).name,
    "바이럴 블로그",
  );
});

test("[가드] 바이럴 utm_source 가 없거나 다르면 예전 판정 그대로다", () => {
  assert.equal(ch("instagram.com"), "instagram");
  assert.equal(ch("l.instagram.com"), "instagram");
  assert.equal(ch("www.threads.com"), "threads");
  assert.equal(ch("m.blog.naver.com"), "naver");
  // 비슷해도 정확히 같지 않으면 바이럴이 아니다
  assert.equal(ch("viral-instagram"), "instagram");
  assert.equal(ch("viral-threads"), "threads");
  assert.equal(ch("viral-blog-naver"), "naver");
});

// 네이버 성과형 디스플레이 광고(GFA)는 /lp/all 로 보내고 utm_source 를 정확히 naver-gfa 로
// 싣는다(2026-11-26, utm_medium paid, utm_campaign gfa-conv). naver 가 들어 있어 검색·블로그와
// 같은 naver 로 합쳐지지 않도록 바이럴처럼 네이버 판정보다 먼저 본다.
test("[가드] utm_source naver-gfa 는 정확히 일치하면 네이버 GFA 채널로 센다", () => {
  const g = (source, medium, channelGroup) =>
    classifyTrafficSource({ source, medium, channelGroup }).key;
  assert.equal(ch("naver-gfa"), "naver_gfa");
  assert.equal(ch("naver-gfa", "paid"), "naver_gfa");
  assert.equal(ch(" Naver-GFA "), "naver_gfa", "대소문자·앞뒤 공백은 봐준다");
  // GA4 가 채널 그룹을 붙여 보내도 네이버 GFA 가 이긴다
  assert.equal(g("naver-gfa", "paid", "Paid Other"), "naver_gfa");
  assert.equal(g("naver-gfa", "paid", "Referral"), "naver_gfa");
  assert.equal(
    classifyTrafficSource({ source: "naver-gfa", medium: "paid", channelGroup: "" }).name,
    "네이버 GFA",
  );
});

test("[가드] utm_source 가 naver-gfa 와 다르거나 없으면 예전 판정 그대로다", () => {
  // 비슷해도 정확히 같지 않으면 네이버 GFA 가 아니다
  assert.equal(ch("naver"), "naver");
  assert.equal(ch("naver", "paid"), "naver");
  assert.equal(ch("naver-gfa-x"), "naver");
  assert.equal(ch("naver-gfa-x", "paid"), "naver");
  // utm_source 없이 리퍼러만 있으면 네이버, 둘 다 없으면 직접 유입
  assert.equal(ch("m.search.naver.com"), "naver");
  assert.equal(ch("(direct)"), "direct");
  assert.equal(ch(""), "direct");
});
