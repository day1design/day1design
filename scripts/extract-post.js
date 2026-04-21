/**
 * Extract content blocks from an original imweb post page
 * Usage: Run in browser console on the post detail page
 * Stores result in window.__extractedData
 */
function extractPostContent() {
  const container = document.querySelector(".board_txt_area.fr-view");
  if (!container) return null;

  const blocks = [];
  let currentText = "";

  function flushText() {
    const t = currentText.replace(/\n{3,}/g, "\n\n").trim();
    if (t.length > 0) blocks.push({ type: "text", content: t });
    currentText = "";
  }

  function processNode(node) {
    if (node.nodeType === 3) {
      const t = node.textContent.trim();
      if (t) currentText += t;
      return;
    }
    if (node.nodeName === "IMG") {
      const src = node.src || node.dataset?.src || "";
      if (src && src.includes("imweb.me/upload")) {
        flushText();
        blocks.push({ type: "image", src: src });
      }
      return;
    }
    if (node.nodeName === "BR") {
      currentText += "\n";
      return;
    }
    for (const child of node.childNodes) processNode(child);
    if (
      [
        "P",
        "DIV",
        "H1",
        "H2",
        "H3",
        "H4",
        "H5",
        "H6",
        "TABLE",
        "UL",
        "OL",
        "LI",
      ].includes(node.nodeName)
    ) {
      currentText += "\n";
    }
  }

  processNode(container);
  flushText();

  const allImgs = Array.from(
    container.querySelectorAll('img[src*="imweb.me/upload"]'),
  ).map((i) => i.src);

  return { content_blocks: blocks, images: allImgs };
}

// Export
if (typeof module !== "undefined") module.exports = { extractPostContent };
