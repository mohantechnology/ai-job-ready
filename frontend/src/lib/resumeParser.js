import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

// Extracts plain text from a PDF resume file, entirely in the browser (the
// file itself is never uploaded to the backend - only the extracted text is).
export async function extractTextFromPdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pageTexts = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();

    // Group text items into lines using their vertical position, so the
    // output roughly preserves the resume's line structure for the LLM.
    const lines = [];
    let currentY = null;
    let currentLine = [];
    for (const item of textContent.items) {
      const y = item.transform?.[5];
      if (currentY === null || Math.abs(y - currentY) > 2) {
        if (currentLine.length) lines.push(currentLine.join(" "));
        currentLine = [item.str];
        currentY = y;
      } else {
        currentLine.push(item.str);
      }
    }
    if (currentLine.length) lines.push(currentLine.join(" "));

    pageTexts.push(lines.join("\n"));
  }

  return pageTexts
    .join("\n\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
