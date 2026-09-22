import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

const LINK_ANNOTATION = 2;

function linkUrl(annotation) {
  const raw = String(annotation?.url || annotation?.unsafeUrl || "").trim();
  if (!raw || /^javascript:/i.test(raw)) return "";
  if (/^https?:\/\//i.test(raw) || /^mailto:/i.test(raw)) return raw;
  return "";
}

function textHitsLink(item, rect) {
  if (!Array.isArray(rect) || rect.length < 4) return false;
  const x = item.transform?.[4];
  const y = item.transform?.[5];
  if (x == null || y == null) return false;
  const cx = x + (Number(item.width) || 0) / 2;
  const cy = y + (Number(item.height) || 0) / 2;
  const left = Math.min(rect[0], rect[2]) - 1;
  const right = Math.max(rect[0], rect[2]) + 1;
  const bottom = Math.min(rect[1], rect[3]) - 3;
  const top = Math.max(rect[1], rect[3]) + 3;
  return cx >= left && cx <= right && cy >= bottom && cy <= top;
}

function itemText(item, links) {
  const text = item.str || "";
  const hit = links.find((link) => textHitsLink(item, link.rect));
  if (!hit || text.includes(hit.url)) return text;
  return `${text} (${hit.url})`;
}

// Extracts plain text from a PDF resume file, entirely in the browser (the
// file itself is never uploaded to the backend - only the extracted text is).
// Link annotations are included too: the visible label keeps its href, and
// every href is listed up front so a URL that is not printed as text is still sent.
export async function extractTextFromPdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pageTexts = [];
  const seenUrls = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const [textContent, annotations] = await Promise.all([page.getTextContent(), page.getAnnotations()]);
    const links = (annotations || [])
      .filter((annotation) => annotation?.annotationType === LINK_ANNOTATION || annotation?.subtype === "Link")
      .map((annotation) => ({ url: linkUrl(annotation), rect: annotation.rect }))
      .filter((link) => link.url);
    for (const link of links) {
      if (!seenUrls.includes(link.url)) seenUrls.push(link.url);
    }

    // Group text items into lines using their vertical position, so the
    // output roughly preserves the resume's line structure for the LLM.
    const lines = [];
    let currentY = null;
    let currentLine = [];
    for (const item of textContent.items) {
      const y = item.transform?.[5];
      const text = itemText(item, links);
      if (currentY === null || Math.abs(y - currentY) > 2) {
        if (currentLine.length) lines.push(currentLine.join(" "));
        currentLine = [text];
        currentY = y;
      } else {
        currentLine.push(text);
      }
    }
    if (currentLine.length) lines.push(currentLine.join(" "));

    pageTexts.push(lines.join("\n"));
  }

  const body = pageTexts
    .join("\n\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!seenUrls.length) return body;
  return `Linked URLs:\n${seenUrls.join("\n")}\n\n${body}`.trim();
}
