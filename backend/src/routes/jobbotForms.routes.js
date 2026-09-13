import { Router } from "express";
import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { OUTPUT_DIR } from "../lib/jobbotHtmlParser.js";

// Ported from job-bot/backend/src/routes/formsPages.js. Test-only debug
// viewer for the fill prompt - not used by the extension itself. Mounted at
// /forms in app.js.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// backend/src/routes -> backend/public
export const PUBLIC_FORMS_DIR = path.resolve(__dirname, "../../public");

const router = Router();

async function listFilenames(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
      .map((entry) => entry.name);
  } catch (err) {
    if (err && err.code === "ENOENT") return [];
    throw err;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// GET /forms - index of the stable sample plus whatever is currently in output/
router.get("/", async (_req, res) => {
  try {
    const [publicFiles, outputFiles] = await Promise.all([
      listFilenames(PUBLIC_FORMS_DIR),
      listFilenames(OUTPUT_DIR)
    ]);
    const names = [...new Set([...publicFiles, ...outputFiles])].sort();
    const links = names
      .map((name) => `<li><a href="/forms/${encodeURIComponent(name)}">${escapeHtml(name)}</a></li>`)
      .join("\n");

    res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Job Bot test forms</title>
  <style>
    body { font-family: sans-serif; max-width: 640px; margin: 40px auto; padding: 0 16px; }
    a { color: #4f46e5; }
  </style>
</head>
<body>
  <h1>Test forms</h1>
  <p>Stable sample plus the last fill dumps from <code>backend/output/</code>.</p>
  <ul>
    ${links || "<li>No files yet. Open <a href=\"/forms/sample.html\">sample.html</a> or run an Autofill.</li>"}
  </ul>
</body>
</html>`);
  } catch (err) {
    console.error("[jobbot] failed to list /forms:", err);
    res.status(500).send("Failed to list forms");
  }
});

// Output dumps first so /forms/parsed.html etc. are the latest fill, then
// backend/public for the stable sample.html that is not overwritten.
router.use(express.static(OUTPUT_DIR, { index: false, fallthrough: true }));
router.use(express.static(PUBLIC_FORMS_DIR, { index: false, fallthrough: true }));

export default router;
