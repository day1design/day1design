const https = require("https");
const fs = require("fs");
const path = require("path");

const communityPath = path.join(
  __dirname,
  "..",
  "site",
  "data",
  "community.json",
);
const community = JSON.parse(fs.readFileSync(communityPath, "utf8"));

// ── CLI args ──
const args = process.argv.slice(2);
const localOnly = args.includes("--local-only");
const singleIdx = args.find((a) => /^\d+$/.test(a));

// ── HTTP fetch ──
function fetchPage(idx, board) {
  return new Promise((resolve, reject) => {
    const boardPath = board === "Commercial" ? "Commercial" : "Residential";
    const url = `https://day1design.co.kr/${boardPath}/?q=YToxOntzOjEyOiJrZXl3b3JkX3R5cGUiO3M6MzoiYWxsIjt9&bmode=view&idx=${idx}&t=board`;
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Count original images from fetched HTML ──
function countOriginalImages(html) {
  // Locate board_txt_area fr-view
  const startMarker = "board_txt_area fr-view";
  let startIdx = html.indexOf(startMarker);
  if (startIdx === -1) return null;

  let divStart = html.lastIndexOf("<div", startIdx);
  startIdx = html.indexOf(">", divStart) + 1;

  // Walk to find matching </div>
  let depth = 1;
  let pos = startIdx;
  let endIdx;
  while (depth > 0 && pos < html.length) {
    const nextOpen = html.indexOf("<div", pos);
    const nextClose = html.indexOf("</div>", pos);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + 4;
    } else {
      depth--;
      if (depth === 0) endIdx = nextClose;
      pos = nextClose + 6;
    }
  }

  if (!endIdx) return null;
  let content = html.substring(startIdx, endIdx);

  // Also collect content from widget_text_wrap divs after board_txt_area (100KB range)
  let searchPos = endIdx;
  const searchLimit = Math.min(endIdx + 100000, html.length);

  while (searchPos < searchLimit) {
    const widgetIdx = html.indexOf("widget_text_wrap", searchPos);
    if (widgetIdx === -1 || widgetIdx >= searchLimit) break;

    const wDivStart = html.lastIndexOf("<div", widgetIdx);
    const wContentStart = html.indexOf(">", wDivStart) + 1;

    let wDepth = 1;
    let wPos = wContentStart;
    let wEndIdx;
    while (wDepth > 0 && wPos < html.length) {
      const wNextOpen = html.indexOf("<div", wPos);
      const wNextClose = html.indexOf("</div>", wPos);
      if (wNextClose === -1) break;
      if (wNextOpen !== -1 && wNextOpen < wNextClose) {
        wDepth++;
        wPos = wNextOpen + 4;
      } else {
        wDepth--;
        if (wDepth === 0) wEndIdx = wNextClose;
        wPos = wNextClose + 6;
      }
    }

    if (wEndIdx !== undefined) {
      const widgetContent = html.substring(wContentStart, wEndIdx);
      if (/imweb\.me\/upload/.test(widgetContent)) {
        content += widgetContent;
      }
      searchPos = wEndIdx + 6;
    } else {
      break;
    }
  }

  // Count imweb.me/upload images
  const imgRegex =
    /<img[^>]*src=["']([^"']*imweb\.me\/upload[^"']*)["'][^>]*>/gi;
  const images = [];
  let m;
  while ((m = imgRegex.exec(content)) !== null) {
    images.push(m[1]);
  }
  return images;
}

// ── Test functions ──

function testContentBlocksImageCount(post) {
  const imgBlocks = (post.content_blocks || []).filter(
    (b) => b.type === "image",
  );
  const imagesLen = (post.images || []).length;
  if (imgBlocks.length !== imagesLen) {
    return `content_blocks image count (${imgBlocks.length}) != images array length (${imagesLen})`;
  }
  return null;
}

function testNoTripleNewlines(post) {
  const failures = [];
  (post.content_blocks || []).forEach((b, i) => {
    if (b.type === "text" && /\n\n\n/.test(b.content)) {
      failures.push(`Triple+ newline in text block ${i}`);
    }
  });
  return failures.length > 0 ? failures.join("; ") : null;
}

function testNoLeadingWhitespace(post) {
  const failures = [];
  (post.content_blocks || []).forEach((b, i) => {
    if (b.type !== "text") return;
    const lines = b.content.split("\n");
    for (let li = 0; li < lines.length; li++) {
      if (lines[li].length > 0 && /^\s/.test(lines[li])) {
        failures.push(`Leading whitespace in text block ${i} line ${li + 1}`);
        break; // one failure per block is enough
      }
    }
  });
  return failures.length > 0 ? failures.join("; ") : null;
}

function testSubheadingDetectable(post) {
  // Check that room-name subheadings exist as standalone lines
  const roomKeywords = [
    "현관",
    "거실",
    "주방",
    "안방",
    "욕실",
    "드레스룸",
    "서재",
    "아이방",
    "자녀방",
    "서브룸",
    "발코니",
    "베란다",
    "다이닝",
    "세탁실",
    "펜트리",
    "파우더룸",
  ];
  const textBlocks = (post.content_blocks || [])
    .filter((b) => b.type === "text")
    .map((b) => b.content);
  const allText = textBlocks.join("\n");
  const lines = allText.split("\n");

  // Find lines that look like subheadings
  const subheadings = lines.filter((line) => {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.length > 30) return false;
    // Contains │ or | separator
    if (/[│|]/.test(trimmed)) return true;
    // Starts with a room keyword
    for (const kw of roomKeywords) {
      if (trimmed.startsWith(kw)) return true;
    }
    return false;
  });

  // This is a soft check: we only flag if there are zero subheadings
  // but the post has 3+ images (likely multi-room post)
  if (subheadings.length === 0 && (post.images || []).length >= 3) {
    return `No subheadings detected in ${(post.images || []).length}-image post`;
  }
  return null;
}

function testOriginalImageCount(post, origImages) {
  if (origImages === null) {
    return "SKIP:could not parse original page";
  }
  const localCount = (post.images || []).length;
  const origCount = origImages.length;
  if (localCount !== origCount) {
    return `Image count mismatch: local=${localCount} orig=${origCount}`;
  }
  return null;
}

// ── Main ──
async function main() {
  let posts = community.posts;
  if (singleIdx) {
    posts = posts.filter((p) => p.idx === singleIdx);
    if (posts.length === 0) {
      console.log(`No post found with idx=${singleIdx}`);
      process.exit(1);
    }
  }

  console.log(
    `Testing ${posts.length} posts${localOnly ? " (local-only)" : ""}...\n`,
  );

  let passCount = 0;
  let failCount = 0;
  let skipCount = 0;
  const failedPosts = [];

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const shortTitle = post.title.substring(0, 30);
    const errors = [];

    // Local tests
    const t1 = testContentBlocksImageCount(post);
    if (t1) errors.push(t1);

    const t2 = testNoTripleNewlines(post);
    if (t2) errors.push(t2);

    const t3 = testNoLeadingWhitespace(post);
    if (t3) errors.push(t3);

    const t4 = testSubheadingDetectable(post);
    if (t4) errors.push(t4);

    // Remote test (original image count)
    let skipped = false;
    if (!localOnly) {
      try {
        const html = await fetchPage(post.idx, post.board);
        const origImages = countOriginalImages(html);
        const t5 = testOriginalImageCount(post, origImages);
        if (t5) {
          if (t5.startsWith("SKIP:")) {
            skipped = true;
          } else {
            errors.push(t5);
          }
        }
      } catch (err) {
        skipped = true;
        console.log(
          `[SKIP] ${post.idx} - ${shortTitle} (fetch error: ${err.message})`,
        );
        skipCount++;
        if (errors.length > 0) {
          // Still report local errors for skipped fetch posts
          failCount++;
          failedPosts.push({ idx: post.idx, title: shortTitle, errors });
          errors.forEach((e) => console.log(`  \u2717 ${e}`));
        }
        await sleep(300);
        continue;
      }
      await sleep(300);
    }

    if (skipped && errors.length === 0) {
      console.log(`[SKIP] ${post.idx} - ${shortTitle}`);
      skipCount++;
    } else if (errors.length > 0) {
      const imgBlocks = (post.content_blocks || []).filter(
        (b) => b.type === "image",
      );
      const blockCount = (post.content_blocks || []).length;
      console.log(`[FAIL] ${post.idx} - ${shortTitle}`);
      errors.forEach((e) => console.log(`  \u2717 ${e}`));
      failCount++;
      failedPosts.push({ idx: post.idx, title: shortTitle, errors });
    } else {
      const imgCount = (post.images || []).length;
      const blockCount = (post.content_blocks || []).length;
      console.log(
        `[PASS] ${post.idx} - ${shortTitle} (imgs:${imgCount} blocks:${blockCount})`,
      );
      passCount++;
    }
  }

  console.log(
    `\nSummary: ${passCount} PASS / ${failCount} FAIL / ${skipCount} SKIP`,
  );

  if (failedPosts.length > 0) {
    console.log("\nFailed posts:");
    failedPosts.forEach((fp) => {
      console.log(`  ${fp.idx} - ${fp.title}`);
      fp.errors.forEach((e) => console.log(`    \u2717 ${e}`));
    });
  }
}

main().catch(console.error);
