import { parse, NodeType } from "node-html-parser";
import fs from "fs/promises";
import path from "path";

// Ported from job-bot/backend/src/lib/htmlParser.js as part of merging the
// job-bot extension's backend into this one (see jobbot form routes/services).
// dist/lib -> backend/output (same depth as the old src/lib path).
export const OUTPUT_DIR = path.resolve(__dirname, "../../output");

// Noise the LLM never needs: executable/media/chrome, plus SVG internals
// that survive a parent <svg> strip. Form fields, labels, and page text stay.
const DROP_TAGS = new Set([
  "meta",
  "header",
  "footer",
  "nav",
  "script",
  "style",
  "noscript",
  "svg",
  "link",
  // "iframe",
  "canvas",
  "video",
  "audio",
  "picture",
  "source",
  "img",
  "path",
  "symbol",
  "use",
  "defs",
  "clippath",
  "lineargradient",
  "radialgradient",
  "object",
  "embed",
  "applet",
  "base",
  "map",
  "area",
  "track",
  "param",
  "plasmo-csui"
]);

// Keep only attributes that identify a field, describe it, or carry a value.
// class/style/event-handlers/src are dropped - they inflate tokens and don't help filling.
const KEEP_ATTRS = new Set([
  "id",
  "name",
  "type",
  "value",
  "href",
  "for",
  "placeholder",
  "required",
  "checked",
  "selected",
  "disabled",
  "readonly",
  "min",
  "max",
  "maxlength",
  "minlength",
  "pattern",
  "multiple",
  "autocomplete",
  "action",
  "method",
  "role",
  "title",
  "alt",
  "content",
  "property",
  "label",
  "rows",
  "cols",
  "step",
  "wrap",
  "accept",
  "hidden",
  "aria-label",
  "aria-labelledby",
  "aria-describedby",
  "aria-required",
  "aria-hidden",
  "data-jobbot-id"
]);

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);

const PRESERVE_WS_TAGS = new Set(["pre", "textarea", "code"]);

function shouldKeepAttr(name) {
  const lower = name.toLowerCase();
  if (KEEP_ATTRS.has(lower)) return true;
  if (lower.startsWith("aria-")) return true;
  return false;
}

function escapeText(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

const BOOLEAN_ATTRS = new Set([
  "required",
  "checked",
  "selected",
  "disabled",
  "readonly",
  "multiple",
  "hidden"
]);

function stripAttributes(node) {
  if (node.nodeType !== NodeType.ELEMENT_NODE) return;

  const kept = {};
  for (const [key, value] of Object.entries(node.attributes || {})) {
    if (!shouldKeepAttr(key) || value == null) continue;
    const asString = String(value);
    // Guard against a leftover huge value (e.g. a data: URI on a kept attr).
    if (asString.length > 2000) continue;
    // Boolean attrs are often present as `required` / `required=""` - keep them.
    if (asString.trim() === "" && !BOOLEAN_ATTRS.has(key.toLowerCase()) && key.toLowerCase() !== "value") {
      continue;
    }
    kept[key] = asString;
  }
  node.setAttributes(kept);

  for (const child of node.childNodes) {
    stripAttributes(child);
  }
}

function serialize(node, depth) {
  if (node.nodeType === NodeType.COMMENT_NODE) return "";

  if (node.nodeType === NodeType.TEXT_NODE) {
    const text = (node.rawText ?? node.text ?? "").replace(/\s+/g, " ");
    return text.trim() ? text : "";
  }

  if (node.nodeType !== NodeType.ELEMENT_NODE) return "";

  const tag = (node.rawTagName || "").toLowerCase();
  // node-html-parser wraps a full document in a tagless root.
  if (!tag) {
    return (node.childNodes || []).map((child) => serialize(child, depth)).join("");
  }

  const indent = "  ".repeat(depth);
  const attrs = node.attributes || {};
  const attrStr = Object.entries(attrs)
    .map(([key, value]) => ` ${key}="${escapeAttr(value)}"`)
    .join("");

  if (VOID_TAGS.has(tag)) {
    return `${indent}<${tag}${attrStr}>\n`;
  }

  const children = node.childNodes || [];

  if (PRESERVE_WS_TAGS.has(tag)) {
    const inner = children.map((child) => child.toString()).join("");
    return `${indent}<${tag}${attrStr}>${inner}</${tag}>\n`;
  }

  const onlyText =
    children.length === 1 && children[0].nodeType === NodeType.TEXT_NODE;
  if (onlyText) {
    const text = (children[0].rawText ?? "").replace(/\s+/g, " ").trim();
    return `${indent}<${tag}${attrStr}>${escapeText(text)}</${tag}>\n`;
  }

  const parts = [];
  for (const child of children) {
    const serialized = serialize(child, depth + 1);
    if (serialized && serialized.trim()) parts.push(serialized);
  }

  if (parts.length === 0) {
    return `${indent}<${tag}${attrStr}></${tag}>\n`;
  }

  return `${indent}<${tag}${attrStr}>\n${parts.join("")}${indent}</${tag}>\n`;
}

/**
 * Strip a raw HTML page down to what the LLM actually needs: tags,
 * identifying/form attributes (especially `id` / `data-jobbot-id`), and
 * text content. Scripts, styles, media, comments, and noisy attributes
 * (class, style, event handlers, src) are dropped.
 *
 * @param {string} html
 * @returns {string} pretty-printed cleaned HTML
 */
export function parsePageHtml(html) {
  if (typeof html !== "string" || html.trim().length === 0) return "";

  const root = parse(html, {
    comment: false,
    blockTextElements: {
      script: false,
      style: false,
      noscript: false
    }
  });

  for (const tag of DROP_TAGS) {
    root.querySelectorAll(tag).forEach((el) => el.remove());
  }
  // Hidden inputs are never filled; dropping them saves tokens.
  root.querySelectorAll('input[type="hidden"]').forEach((el) => el.remove());
  root.querySelectorAll("#__plasmo-loading__").forEach((el) => el.remove());

  stripAttributes(root);

  return serialize(root, 0).trim() + "\n";
}

/**
 * Write named snapshots under `backend/output/` so a fill request can be
 * inspected as files. Test-only - a write failure must never break filling.
 *
 * @param {Record<string, string>} files - filename -> contents
 */
export async function writeDebugOutput(files) {
  try {
    Object.keys(files).forEach(async (filePath) => {
      let dirArray = filePath.split("/");
      dirArray.pop();
      await fs.mkdir(path.join(OUTPUT_DIR, dirArray.join("/")), { recursive: true });
      fs.writeFile(path.join(OUTPUT_DIR, filePath), files[filePath] ?? "", "utf8");
    });
  } catch (err) {
    console.warn("[jobbot] failed to write debug output files:", err);
  }
}
