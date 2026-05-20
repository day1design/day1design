// 자체 히트맵용 페이지 스크린샷 캡쳐 (PC + Mobile)
// 명세: HEATMAP_SPEC.md Step 2
// 실행: node scripts/capture-heatmap-screenshots.mjs
//
// 의존성: 전역 playwright (C:/Users/flame/AppData/Roaming/npm/node_modules)

import { createRequire } from "module";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 전역 모듈 해석
const require = createRequire(import.meta.url);
const Module = require("module");
const globalNodeModules = "C:/Users/flame/AppData/Roaming/npm/node_modules";
Module.globalPaths.push(globalNodeModules);
process.env.NODE_PATH = globalNodeModules;
Module.Module?._initPaths?.();

const { chromium } = require("playwright");

const BASE = "https://day1design.co.kr";
const PAGES = [
  { path: "/", slug: "index" },
  { path: "/pages/about.html", slug: "about" },
  { path: "/pages/portfolio.html", slug: "portfolio" },
  { path: "/pages/community.html", slug: "community" },
  { path: "/pages/estimates.html", slug: "estimates" },
  { path: "/pages/project-flow.html", slug: "project-flow" },
  // community-detail은 idx 쿼리 필요 — 대표 1건 사용
  {
    path: "/pages/community-detail.html?idx=170198572",
    slug: "community-detail",
    storedPath: "/pages/community-detail.html",
  },
];

const DEVICES = [
  {
    name: "pc",
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    isMobile: false,
  },
  {
    name: "mobile",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
  },
];

const OUT_DIR = path.join(__dirname, "..", ".scratch-heatmap-shots");

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function capture() {
  await ensureDir(OUT_DIR);
  const browser = await chromium.launch();
  const results = [];

  for (const p of PAGES) {
    for (const d of DEVICES) {
      const context = await browser.newContext({
        viewport: d.viewport,
        deviceScaleFactor: d.deviceScaleFactor,
        isMobile: d.isMobile,
        userAgent: d.isMobile
          ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
          : undefined,
      });
      const page = await context.newPage();
      const url = BASE + p.path;
      console.log(`[capture] ${d.name} ${url}`);
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
      } catch (e) {
        console.warn(`  goto timeout, continuing: ${e.message}`);
      }
      // 폰트·초기 렌더 안정화
      await page.waitForTimeout(1500);

      // Lazy-load 트리거: 끝까지 천천히 스크롤 → 이미지/요소 로드 유도
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          const totalH = Math.max(
            document.documentElement.scrollHeight,
            document.body.scrollHeight,
          );
          let y = 0;
          const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
          const tick = setInterval(() => {
            window.scrollTo(0, y);
            y += step;
            if (y >= totalH + step) {
              clearInterval(tick);
              window.scrollTo(0, totalH);
              setTimeout(resolve, 300);
            }
          }, 120);
        });
      });

      // 모든 <img>가 디코드 완료될 때까지 대기 (lazy-load 후 네트워크 안정화)
      try {
        await page.waitForLoadState("networkidle", { timeout: 15000 });
      } catch (_) {}
      await page.evaluate(async () => {
        const imgs = Array.from(document.images);
        await Promise.all(
          imgs.map((img) => {
            if (img.complete && img.naturalHeight !== 0) return;
            return new Promise((resolve) => {
              img.addEventListener("load", resolve, { once: true });
              img.addEventListener("error", resolve, { once: true });
              setTimeout(resolve, 4000);
            });
          }),
        );
      });

      // 상단으로 복귀 + 헤더 등 sticky 정상화
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);

      // 전체 페이지 크기 측정
      const pageSize = await page.evaluate(() => ({
        w: Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        ),
        h: Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight,
        ),
      }));

      const fileName = `${p.slug}_${d.name}.png`;
      const filePath = path.join(OUT_DIR, fileName);
      await page.screenshot({
        path: filePath,
        fullPage: true,
        type: "png",
      });
      const stat = await fs.stat(filePath);
      console.log(
        `  saved ${fileName} (${(stat.size / 1024).toFixed(0)}KB, ${pageSize.w}x${pageSize.h})`,
      );

      results.push({
        storedPath: p.storedPath || p.path,
        device: d.name,
        file: filePath,
        fileName,
        page_w: pageSize.w,
        page_h: pageSize.h,
      });

      await context.close();
    }
  }

  await browser.close();
  // results.json 저장 — 후속 업로드 스텝이 사용
  const manifestPath = path.join(OUT_DIR, "manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(results, null, 2));
  console.log(`\n✓ ${results.length}장 캡쳐 완료`);
  console.log(`  manifest: ${manifestPath}`);
  console.log(`  files: ${OUT_DIR}`);
}

capture().catch((e) => {
  console.error(e);
  process.exit(1);
});
