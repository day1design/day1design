/* ============================================================
 * DAY1DESIGN · Page Loader Controller
 * - window.load 이벤트(모든 리소스 로드 완료)에 로더 페이드아웃
 * - 최소 노출 시간(MIN_DISPLAY_MS) 보장 — 빠른 연결에서 깜빡임 방지
 * - 페일세이프 타임아웃(FAILSAFE_MS) — 리소스 멈춤 대비
 * ============================================================ */
(function () {
  var loader = document.getElementById("page-loader");
  if (!loader) return;

  var MIN_DISPLAY_MS = 800; // 최소 노출
  var FADE_OUT_MS = 700; // CSS transition 과 맞춤
  var FAILSAFE_MS = 10000; // 강제 숨김 타임아웃

  var startTime = Date.now();
  var hidden = false;

  function hideLoader() {
    if (hidden) return;
    hidden = true;
    var elapsed = Date.now() - startTime;
    var remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);
    setTimeout(function () {
      loader.classList.add("is-hidden");
      // 페이드아웃 완료 후 DOM 제거
      setTimeout(function () {
        if (loader.parentNode) loader.parentNode.removeChild(loader);
      }, FADE_OUT_MS);
    }, remaining);
  }

  // 히어로 슬라이더가 있는 페이지(index)는 첫 슬라이드 이미지 로드까지 기다림
  // → 로더가 사라진 뒤 잠깐 검정 배경이 보이는 현상 방지
  var hasHero = !!document.getElementById("heroTrack");
  var windowLoaded = document.readyState === "complete";
  var heroReady = !hasHero; // 히어로가 없으면 즉시 준비 완료 처리

  function tryHide() {
    if (windowLoaded && heroReady) hideLoader();
  }

  if (!windowLoaded) {
    window.addEventListener("load", function () {
      windowLoaded = true;
      tryHide();
    });
  }

  if (hasHero) {
    window.addEventListener("day1:hero-ready", function () {
      heroReady = true;
      tryHide();
    });
  }

  // 페일세이프
  setTimeout(hideLoader, FAILSAFE_MS);

  // 초기 상태 체크
  tryHide();
})();
