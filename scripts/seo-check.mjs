import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const site = join(root, "site");
const publicPages = [
  ["home", "index.html", "https://day1design.co.kr/", true],
  ["about", "pages/about.html", "https://day1design.co.kr/pages/about", true],
  [
    "portfolio",
    "pages/portfolio.html",
    "https://day1design.co.kr/pages/portfolio",
    true,
  ],
  [
    "community",
    "pages/community.html",
    "https://day1design.co.kr/pages/community",
    true,
  ],
  [
    "community-detail",
    "pages/community-detail.html",
    "https://day1design.co.kr/pages/community-detail",
    false,
  ],
  [
    "estimates",
    "pages/estimates.html",
    "https://day1design.co.kr/pages/estimates",
    true,
  ],
  [
    "project-flow",
    "pages/project-flow.html",
    "https://day1design.co.kr/pages/project-flow",
    true,
  ],
];

const errors = [];
const warnings = [];

function read(relPath) {
  return readFileSync(join(site, relPath), "utf8");
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function warn(condition, message) {
  if (condition) warnings.push(message);
}

for (const [name, relPath, canonical] of publicPages) {
  const html = read(relPath);
  assert(/<title>[\s\S]*?<\/title>/i.test(html), `${name}: missing title`);
  assert(
    /<meta\s+name="description"\s+content="[^"]{40,180}"/i.test(html),
    `${name}: missing or weak meta description`,
  );
  if (name === "community-detail") {
    // canonical/og:url은 idx별로 JS가 동적 주입 → 정적 매칭 대신 주입 패턴 검증
    assert(
      html.includes(`id="canonicalLink"`) &&
        /canonicalLink.*\.href\s*=/s.test(html),
      `${name}: dynamic canonical injection missing`,
    );
  } else {
    assert(
      html.includes(`rel="canonical"`) && html.includes(canonical),
      `${name}: canonical mismatch`,
    );
  }
  assert(
    /<meta\s+name="robots"\s+content="index,\s*follow/i.test(html),
    `${name}: public page is not index,follow`,
  );
  assert(/property="og:title"/i.test(html), `${name}: missing og:title`);
  assert(
    /property="og:description"/i.test(html),
    `${name}: missing og:description`,
  );
  assert(/property="og:image"/i.test(html), `${name}: missing og:image`);
  assert(
    /application\/ld\+json/i.test(html),
    `${name}: missing structured data`,
  );
  assert(
    !/비밀번호를 입력해주세요|DAYONE DESIGN\s*<\/div>\s*<p>비밀번호/i.test(
      html,
    ),
    `${name}: password gate text leaked into public page`,
  );
}

const robots = read("robots.txt");
assert(
  robots.includes("Sitemap: https://day1design.co.kr/sitemap.xml"),
  "robots.txt: missing sitemap directive",
);
assert(/Disallow:\s*\/admin\//i.test(robots), "robots.txt: admin not blocked");

const sitemap = read("sitemap.xml");
for (const [, , canonical, shouldBeInSitemap] of publicPages) {
  if (!shouldBeInSitemap) continue;
  assert(
    sitemap.includes(`<loc>${canonical}</loc>`),
    `sitemap.xml: missing ${canonical}`,
  );
}

const config = read("js/config.js");
assert(config.includes("window.DAY1_GA4_ID"), "config.js: missing GA4 config");
warn(
  /window\.DAY1_GA4_ID\s*=\s*""/.test(config),
  "config.js: GA4 Measurement ID is still empty; tracking stays disabled until a G-* ID is added",
);

if (warnings.length) {
  console.log("Warnings:");
  for (const item of warnings) console.log(`- ${item}`);
}

if (errors.length) {
  console.error("SEO check failed:");
  for (const item of errors) console.error(`- ${item}`);
  process.exit(1);
}

console.log(`SEO check passed: ${publicPages.length} public pages checked.`);
