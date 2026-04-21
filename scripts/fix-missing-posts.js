const https = require("https");
const fs = require("fs");
const path = require("path");

const MISSING_POSTS = [
  "164068358",
  "164059635",
  "163559704",
  "16036717",
  "15662473",
];

function fetchPage(idx) {
  return new Promise((resolve, reject) => {
    const url = `https://day1design.co.kr/Residential/?q=YToxOntzOjEyOiJrZXl3b3JkX3R5cGUiO3M6MzoiYWxsIjt9&bmode=view&idx=${idx}&t=board`;
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

function extractContentBlocks(html) {
  // Find the board_txt_area content
  const startMarker = "board_txt_area fr-view";
  let startIdx = html.indexOf(startMarker);
  if (startIdx === -1) return null;

  // Find the opening div tag
  let divStart = html.lastIndexOf("<div", startIdx);
  startIdx = html.indexOf(">", divStart) + 1;

  // Find matching closing div - count nesting
  let depth = 1;
  let pos = startIdx;
  while (depth > 0 && pos < html.length) {
    const nextOpen = html.indexOf("<div", pos);
    const nextClose = html.indexOf("</div>", pos);

    if (nextClose === -1) break;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + 4;
    } else {
      depth--;
      if (depth === 0) {
        var endIdx = nextClose;
      }
      pos = nextClose + 6;
    }
  }

  if (!endIdx) return null;
  const content = html.substring(startIdx, endIdx);

  // Parse content blocks
  const blocks = [];
  const images = [];

  // Extract images with their positions
  const imgRegex =
    /<img[^>]*src=["']([^"']*imweb\.me\/upload[^"']*)["'][^>]*>/gi;
  let imgMatch;
  const imgPositions = [];
  while ((imgMatch = imgRegex.exec(content)) !== null) {
    imgPositions.push({ pos: imgMatch.index, src: imgMatch[1] });
    images.push(imgMatch[1]);
  }

  // Extract text between images
  let lastPos = 0;
  for (const img of imgPositions) {
    // Get text between lastPos and this image
    const textChunk = content.substring(lastPos, img.pos);
    const cleanText = stripHtml(textChunk);
    if (cleanText.length > 0) {
      blocks.push({ type: "text", content: cleanText });
    }
    blocks.push({ type: "image", src: img.src });
    lastPos = img.pos + content.substring(img.pos).indexOf(">") + 1;
  }

  // Get remaining text after last image
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
  // Replace block tags with newlines
  let text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(
      /<\/?(p|div|h[1-6]|li|tr|td|th|table|ul|ol|blockquote)[^>]*>/gi,
      "\n",
    )
    .replace(/<\/?(span|a|strong|b|em|i|u)[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "") // Remove remaining tags
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}

async function main() {
  const communityPath = path.join(
    __dirname,
    "..",
    "site",
    "data",
    "community.json",
  );
  const community = JSON.parse(fs.readFileSync(communityPath, "utf8"));

  let updated = 0;

  for (const idx of MISSING_POSTS) {
    console.log(`\nFetching post ${idx}...`);
    try {
      const html = await fetchPage(idx);
      console.log(`  Page size: ${html.length}`);

      const result = extractContentBlocks(html);
      if (!result) {
        console.log(`  ERROR: Could not extract content`);
        continue;
      }

      console.log(
        `  Blocks: ${result.content_blocks.length}, Images: ${result.images.length}`,
      );

      // Find and update the post in community.json
      const postIdx = community.posts.findIndex((p) => p.idx === idx);
      if (postIdx === -1) {
        console.log(`  ERROR: Post not found in community.json`);
        continue;
      }

      const post = community.posts[postIdx];
      const oldBlocks = post.content_blocks?.length || 0;
      const oldImages = post.images?.length || 0;

      post.content_blocks = result.content_blocks;
      post.images = result.images;

      // Update thumb if missing
      if (!post.thumb && result.images.length > 0) {
        post.thumb = result.images[0].replace("/upload/", "/thumbnail/");
      }

      console.log(
        `  Updated: blocks ${oldBlocks} → ${result.content_blocks.length}, images ${oldImages} → ${result.images.length}`,
      );
      updated++;
    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
    }
  }

  // Save updated community.json
  if (updated > 0) {
    fs.writeFileSync(communityPath, JSON.stringify(community, null, 2), "utf8");
    console.log(`\nSaved community.json with ${updated} posts updated.`);
  } else {
    console.log("\nNo posts were updated.");
  }
}

main().catch(console.error);
