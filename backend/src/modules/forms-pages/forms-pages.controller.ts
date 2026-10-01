import { access, readdir } from "fs/promises";
import path from "path";
import { Controller, Get, Param, Res } from "@nestjs/common";
import type { Response } from "express";
import { OUTPUT_DIR } from "../../lib/jobbotHtmlParser";
import { Public } from "../../common/decorators/public.decorator";

const PUBLIC_FORMS_DIR = path.resolve(process.cwd(), "public");

async function listFilenames(dir: string) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && !entry.name.startsWith(".")).map((entry) => entry.name);
  } catch (err) {
    if (err && (err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function resolveFormFile(name: string) {
  const safe = path.basename(name);
  if (!safe || safe !== name) return null;
  const candidates = [path.join(OUTPUT_DIR, safe), path.join(PUBLIC_FORMS_DIR, safe)];
  for (const file of candidates) {
    try {
      await access(file);
      return file;
    } catch {
      // Try the next directory.
    }
  }
  return null;
}

@Controller("forms")
@Public()
export class FormsPagesController {
  @Get()
  async index(@Res() res: Response) {
    try {
      const [publicFiles, outputFiles] = await Promise.all([
        listFilenames(PUBLIC_FORMS_DIR),
        listFilenames(OUTPUT_DIR),
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
  }

  @Get(":name")
  async file(@Param("name") name: string, @Res() res: Response) {
    const file = await resolveFormFile(name);
    if (!file) {
      res.status(404).json({
        error: { message: `Route not found: GET /forms/${path.basename(name)}` },
      });
      return;
    }
    res.sendFile(file);
  }
}
