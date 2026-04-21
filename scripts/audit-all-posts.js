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

function countOriginalImages(html) {
  // Use extractContentBlocks to get the same content scope (board_txt_area + widget_text_wrap)
  const result = extractContentBlocks(html);
  if (!result) return [];
  return result.images;
}

function extractContentBlocks(html) {
  const startMarker = "board_txt_area fr-view";
  let startIdx = html.indexOf(startMarker);
  if (startIdx === -1) return null;

  let divStart = html.lastIndexOf("<div", startIdx);
  startIdx = html.indexOf(">", divStart) + 1;

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

  // Also collect content from widget_text_wrap divs after board_txt_area
  // These are doz_type="text" widgets that contain additional post content
  const afterBoard = html.substring(endIdx + 6); // skip past </div>
  let searchPos = 0;
  while (searchPos < afterBoard.length) {
    const widgetIdx = afterBoard.indexOf("widget_text_wrap", searchPos);
    if (widgetIdx === -1) break;

    // Only collect widgets that have doz_type="text" (actual content widgets)
    const wDivStart = afterBoard.lastIndexOf("<div", widgetIdx);
    const divTag = afterBoard.substring(wDivStart, widgetIdx + 20);
    if (!divTag.includes('doz_type="text"')) {
      searchPos = widgetIdx + 20;
      continue;
    }

    let wContentStart = afterBoard.indexOf(">", wDivStart) + 1;

    // Walk to find matching </div>
    let wDepth = 1;
    let wPos = wContentStart;
    let wEndIdx;
    while (wDepth > 0 && wPos < afterBoard.length) {
      const wNextOpen = afterBoard.indexOf("<div", wPos);
      const wNextClose = afterBoard.indexOf("</div>", wPos);
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
      content += afterBoard.substring(wContentStart, wEndIdx);
      searchPos = wEndIdx + 6;
    } else {
      break;
    }
  }

  const blocks = [];
  const images = [];
  const imgRegex =
    /<img[^>]*src=["']([^"']*imweb\.me\/upload[^"']*)["'][^>]*>/gi;
  let imgMatch;
  const imgPositions = [];
  while ((imgMatch = imgRegex.exec(content)) !== null) {
    imgPositions.push({ pos: imgMatch.index, src: imgMatch[1] });
    images.push(imgMatch[1]);
  }

  let lastPos = 0;
  for (const img of imgPositions) {
    const textChunk = content.substring(lastPos, img.pos);
    const cleanText = stripHtml(textChunk);
    if (cleanText.length > 0) {
      blocks.push({ type: "text", content: cleanText });
    }
    blocks.push({ type: "image", src: img.src });
    lastPos = img.pos + content.substring(img.pos).indexOf(">") + 1;
  }

  if (lastPos < content.length) {
    const textChunk = content.substring(lastPos);
    const cleanText = stripHtml(textChunk);
    if (cleanText.length > 0) {
      blocks.push({ type: "text", content: cleanText });
    }
  }

  return { content_blocks: blocks, images };
}

function stripHtml(html) {
  // imweb uses <p> per line. <p><br></p> or <p>&nbsp;</p> = paragraph break.
  // Consecutive <p>text</p> = just line breaks within same paragraph.

  let text = html
    // <br> = line break
    .replace(/<br\s*\/?>/gi, "\n")
    // Closing block tags = single line break (NOT paragraph break)
    .replace(/<\/(p|div|h[1-6]|li|tr|td|th|table|ul|ol|blockquote)>/gi, "\n")
    // Opening block tags (remove)
    .replace(/<(p|div|h[1-6]|li|tr|td|th|table|ul|ol|blockquote)[^>]*>/gi, "")
    // Remove inline tags
    .replace(/<\/?(span|a|strong|b|em|i|u|font|sup|sub)[^>]*>/gi, "")
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

  // Clean up whitespace
  text = text
    .replace(/[ \t]+/g, " ") // collapse horizontal whitespace
    .replace(/ ?\n ?/g, "\n") // trim spaces around newlines
    .replace(/\n{3,}/g, "\n\n") // max double newline (paragraph break)
    .trim();

  // Trim each line individually to remove lingering leading/trailing spaces
  text = text
    .split("\n")
    .map((line) => line.trim())
    .join("\n");

  return text;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const board = process.argv[2] || "Residential";
  const posts = community.posts.filter((p) => p.board === board);
  console.log(`Auditing ${posts.length} ${board} posts...\n`);

  const mismatches = [];
  let fixedCount = 0;

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    process.stdout.write(`[${i + 1}/${posts.length}] ${post.idx} `);

    try {
      const html = await fetchPage(post.idx, board);
      const origImgs = countOriginalImages(html);
      const localImgBlocks = (post.content_blocks || []).filter(
        (b) => b.type === "image",
      );

      const origCount = origImgs.length;
      const localCount = localImgBlocks.length;
      const localImagesCount = (post.images || []).length;

      if (origCount !== localCount || origCount !== localImagesCount) {
        console.log(
          `MISMATCH orig:${origCount} blocks:${localCount} images:${localImagesCount} - ${post.title.substring(0, 40)}`,
        );
        mismatches.push({
          idx: post.idx,
          title: post.title,
          origImgs: origCount,
          localImgBlocks: localCount,
          localImages: localImagesCount,
        });

        // Auto-fix: re-extract content blocks from original
        const result = extractContentBlocks(html);
        if (result && result.images.length > 0) {
          post.content_blocks = result.content_blocks;
          post.images = result.images;
          if (!post.thumb && result.images.length > 0) {
            post.thumb = result.images[0].replace("/upload/", "/thumbnail/");
          }
          // Clean text blocks
          post.content_blocks.forEach((block) => {
            if (block.type === "text") {
              block.content = block.content
                .replace(/\uFEFF/g, "")
                .replace(/ +\n/g, "\n")
                .replace(/\n +/g, "\n")
                .replace(/\n{3,}/g, "\n\n")
                .trim();
            }
          });
          fixedCount++;
          process.stdout.write("  → FIXED\n");
        }
      } else {
        console.log(`OK (${origCount} imgs)`);
      }
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
    }

    // Rate limit
    await sleep(200);
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total: ${posts.length}`);
  console.log(`Mismatches: ${mismatches.length}`);
  console.log(`Fixed: ${fixedCount}`);

  if (fixedCount > 0) {
    fs.writeFileSync(communityPath, JSON.stringify(community, null, 2), "utf8");
    console.log(`\nSaved community.json with ${fixedCount} posts fixed.`);
  }

  if (mismatches.length > 0) {
    console.log("\nMismatched posts:");
    mismatches.forEach((m) => {
      console.log(
        `  ${m.idx}: orig=${m.origImgs} local_blocks=${m.localImgBlocks} local_images=${m.localImages} - ${m.title.substring(0, 50)}`,
      );
    });
  }
}

main().catch(console.error);
