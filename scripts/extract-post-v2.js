/**
 * Community post extractor v2
 * Extracts content_blocks from imweb original pages
 *
 * Usage:
 *   node scripts/extract-post-v2.js 170198572          # single post
 *   node scripts/extract-post-v2.js --all               # all posts
 *   node scripts/extract-post-v2.js --all --dry-run     # check only, don't write
 */
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

/**
 * Extract the post content zone from HTML.
 * Strategy: collect content from board_txt_area AND any widget_text_wrap divs
 * that contain imweb upload images, regardless of comment/nav in between.
 */
function getContentZone(html) {
  const startMarker = "board_txt_area fr-view";
  const startIdx = html.indexOf(startMarker);
  if (startIdx === -1) return null;

  // 1. Extract board_txt_area div content
  const divStart = html.lastIndexOf("<div", startIdx);
  const contentStart = html.indexOf(">", divStart) + 1;

  let depth = 1,
    pos = contentStart,
    boardEndIdx;
  while (depth > 0 && pos < html.length) {
    const nextOpen = html.indexOf("<div", pos);
    const nextClose = html.indexOf("</div>", pos);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + 4;
    } else {
      depth--;
      if (depth === 0) boardEndIdx = nextClose;
      pos = nextClose + 6;
    }
  }
  if (!boardEndIdx) return null;

  let zone = html.substring(contentStart, boardEndIdx);

  // 2. Find all widget_text_wrap divs after board_txt_area that contain images
  let searchPos = boardEndIdx;
  // Search up to 100KB after board_txt_area for additional widget sections
  const searchLimit = Math.min(boardEndIdx + 100000, html.length);

  while (searchPos < searchLimit) {
    const widgetIdx = html.indexOf("widget_text_wrap", searchPos);
    if (widgetIdx === -1 || widgetIdx >= searchLimit) break;

    const wDivStart = html.lastIndexOf("<div", widgetIdx);
    const wContentStart = html.indexOf(">", wDivStart) + 1;

    let wDepth = 1,
      wPos = wContentStart,
      wEndIdx;
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

    if (wEndIdx) {
      const widgetContent = html.substring(wContentStart, wEndIdx);
      // Only include if it has imweb upload images
      if (/imweb\.me\/upload/.test(widgetContent)) {
        zone += widgetContent;
      }
      searchPos = wEndIdx + 6;
    } else {
      break;
    }
  }

  return zone;
}

// Broken iframe fragment images - skip these globally
const BLACKLISTED_IMAGES = [
  "92d653689ec7a.png",
  "d901ab31360f7.png",
  "22c1e06963318.png",
  "c90f18a88d0f8.png",
];

/**
 * Parse content zone into interleaved text/image blocks
 */
function parseContentBlocks(zone) {
  const blocks = [];
  const images = [];

  // Find all imweb upload images with their positions
  const imgRegex =
    /<img[^>]*src=["']([^"']*imweb\.me\/upload[^"']*)["'][^>]*>/gi;
  let match;
  const imgPositions = [];
  while ((match = imgRegex.exec(zone)) !== null) {
    // Skip blacklisted broken iframe images
    if (BLACKLISTED_IMAGES.some((b) => match[1].includes(b))) continue;
    imgPositions.push({ pos: match.index, src: match[1] });
    images.push(match[1]);
  }

  // Extract text between images
  let lastPos = 0;
  for (const img of imgPositions) {
    const textChunk = zone.substring(lastPos, img.pos);
    const cleanText = stripHtml(textChunk);
    if (cleanText.length > 0) {
      blocks.push({ type: "text", content: cleanText });
    }
    blocks.push({ type: "image", src: img.src });
    // Move past the img tag
    const imgTagEnd = zone.indexOf(">", img.pos);
    lastPos = imgTagEnd !== -1 ? imgTagEnd + 1 : img.pos + 50;
  }

  // Remaining text after last image
  if (lastPos < zone.length) {
    const textChunk = zone.substring(lastPos);
    const cleanText = stripHtml(textChunk);
    if (cleanText.length > 0) {
      blocks.push({ type: "text", content: cleanText });
    }
  }

  return { content_blocks: blocks, images };
}

function stripHtml(html) {
  let text = html
    // <br> = line break
    .replace(/<br\s*\/?>/gi, "\n")
    // Closing block tags = line break
    .replace(/<\/(p|div|h[1-6]|li|tr|td|th|table|ul|ol|blockquote)>/gi, "\n")
    // Opening block tags = remove
    .replace(/<(p|div|h[1-6]|li|tr|td|th|table|ul|ol|blockquote)[^>]*>/gi, "")
    // Remove inline tags
    .replace(/<\/?(span|a|strong|b|em|i|u|font|sup|sub|center)[^>]*>/gi, "")
    // Remove remaining HTML tags
    .replace(/<[^>]+>/g, "")
    // Decode entities
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\uFEFF/g, "");

  // Clean: trim each line, collapse excessive newlines
  text = text
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function processPost(post, dryRun) {
  const html = await fetchPage(post.idx, post.board);
  const zone = getContentZone(html);
  if (!zone) return { error: "Could not find content zone" };

  const result = parseContentBlocks(zone);
  const imgBlocks = result.content_blocks.filter((b) => b.type === "image");
  const textBlocks = result.content_blocks.filter((b) => b.type === "text");

  // Validate
  const issues = [];

  // Check for leading whitespace
  textBlocks.forEach((b, i) => {
    b.content.split("\n").forEach((line, li) => {
      if (line.length > 0 && /^\s/.test(line)) {
        issues.push(`Leading whitespace in block ${i} line ${li + 1}`);
      }
    });
  });

  // Check for triple newlines
  textBlocks.forEach((b, i) => {
    if (/\n\n\n/.test(b.content)) {
      issues.push(`Triple newline in block ${i}`);
    }
  });

  if (!dryRun && issues.length === 0) {
    post.content_blocks = result.content_blocks;
    post.images = result.images;
    if (!post.thumb && result.images.length > 0) {
      post.thumb = result.images[0].replace("/upload/", "/thumbnail/");
    }
  }

  return {
    blocks: result.content_blocks.length,
    images: result.images.length,
    imgBlocks: imgBlocks.length,
    textBlocks: textBlocks.length,
    issues,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const all = args.includes("--all");
  const singleIdx = args.find((a) => /^\d+$/.test(a));

  let posts;
  if (singleIdx) {
    posts = community.posts.filter((p) => p.idx === singleIdx);
  } else if (all) {
    posts = community.posts;
  } else {
    console.log("Usage: node extract-post-v2.js <idx> | --all [--dry-run]");
    return;
  }

  console.log(
    `Processing ${posts.length} posts${dryRun ? " (dry-run)" : ""}...\n`,
  );

  let pass = 0,
    fail = 0,
    errors = 0;

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    process.stdout.write(`[${i + 1}/${posts.length}] ${post.idx} `);

    try {
      const result = await processPost(post, dryRun);
      if (result.error) {
        console.log(`ERROR: ${result.error}`);
        errors++;
      } else if (result.issues.length > 0) {
        console.log(
          `FAIL (imgs:${result.images} blocks:${result.blocks}) - ${post.title.substring(0, 35)}`,
        );
        result.issues.slice(0, 3).forEach((i) => console.log(`  ✗ ${i}`));
        fail++;
      } else {
        console.log(`PASS (imgs:${result.images} blocks:${result.blocks})`);
        pass++;
      }
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      errors++;
    }

    await sleep(250);
  }

  console.log(`\n=== Summary ===`);
  console.log(`${pass} PASS / ${fail} FAIL / ${errors} ERROR`);

  if (!dryRun && pass > 0) {
    fs.writeFileSync(communityPath, JSON.stringify(community, null, 2), "utf8");
    console.log(`Saved community.json (${pass} posts updated)`);
  }
}

main().catch(console.error);
