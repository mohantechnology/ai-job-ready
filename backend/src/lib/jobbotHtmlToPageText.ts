import { parse, NodeType } from "node-html-parser";
import { htmlToText } from "html-to-text";
import { encode as encodeToon } from "@toon-format/toon";
import TurndownService from "turndown";

// Ported from job-bot/backend/src/lib/htmlToPageText.js as part of merging
// the job-bot extension's backend into this one.
const SKIP_INPUT_TYPES = new Set([
  "hidden",
  "submit",
  "button",
  "image",
  "reset",
  "file"
]);

// Plain Turndown: HTML -> markdown, no field rewriting.
const markdownTurndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-"
});

// Custom Turndown: same markdown, but `[kind attr=value]` placeholders
// must not go through the markdown escaper (`[` `]` `=`).
const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-"
});

// Placeholders must not go through Turndown's markdown escaper (`[` `]` `=`).
turndown.addRule("jobbotField", {
  filter: (node) =>
    node.nodeName === "P" && node.getAttribute("data-jobbot-field") === "1",
  replacement: (_content, node) => `\n\n${node.textContent || ""}\n\n`
});

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function quoteValue(value) {
  const s = String(value);
  if (s === "") return '""';
  if (/[\s=;"\[\]:]/.test(s)) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}

function formatControl(kind, el, extraTokens = []) {
  const tokens = [kind];
  const id = el.getAttribute("id");
  const givenId = el.getAttribute("data-jobbot-id");
  if (id) tokens.push(`id=${quoteValue(id)}`);
  else if (givenId) tokens.push(`given_id=${quoteValue(givenId)}`);
  const name = el.getAttribute("name");
  if (name) tokens.push(`name=${quoteValue(name)}`);
  const type = (el.getAttribute("type") || "").toLowerCase();
  if (kind === "text" && type && type !== "text") {
    tokens.push(`type=${quoteValue(type)}`);
  }
  if (el.hasAttribute("required") || el.getAttribute("aria-required") === "true") {
    tokens.push("required");
  }
  const placeholder = el.getAttribute("placeholder");
  if (placeholder) tokens.push(`placeholder=${quoteValue(placeholder)}`);
  for (const token of extraTokens) {
    if (token) tokens.push(token);
  }
  return `[${tokens.join(" ")}]`;
}

function optionPair(value, label) {
  const v = value == null ? "" : String(value);
  const l = String(label || "")
    .replace(/\s+/g, " ")
    .trim();
  if (v === "") return `|=${l}`;
  return `${v}=${l}`;
}

function elementText(el) {
  return String(el?.text || el?.textContent || "")
    .replace(/\s+/g, " ")
    .trim();
}

function controlLabel(el, root) {
  const id = el.getAttribute("id");
  if (id) {
    const safeId = id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const byFor = root.querySelector(`label[for="${safeId}"]`);
    if (byFor) {
      const text = elementText(byFor);
      if (text) return text;
    }
  }
  const wrapping = el.closest("label");
  if (wrapping) {
    const text = elementText(wrapping);
    if (text) return text;
  }
  const aria = el.getAttribute("aria-label");
  if (aria && aria.trim()) return aria.trim();
  const next = el.nextElementSibling;
  if (next && String(next.rawTagName || "").toLowerCase() === "label") {
    const text = elementText(next);
    if (text) return text;
  }
  return "";
}

function radioOptionToken(el, root) {
  const id = el.getAttribute("id");
  const givenId = el.getAttribute("data-jobbot-id");
  const ident = id
    ? `id=${id}:`
    : givenId
      ? `given_id=${givenId}:`
      : "";
  const value = el.getAttribute("value") ?? "";
  const label = controlLabel(el, root);
  return `${ident}${optionPair(value, label)}`;
}

function fieldParagraph(placeholder) {
  const root = parse(
    `<p data-jobbot-field="1">${escapeHtml(placeholder)}</p>`
  );
  return root.querySelector("p") || root.firstChild;
}

function replaceWithPlaceholder(el, placeholder) {
  const node = fieldParagraph(placeholder);
  if (typeof el.replaceWith === "function" && node) {
    el.replaceWith(node);
    return;
  }
  el.insertAdjacentHTML(
    "afterend",
    `<p data-jobbot-field="1">${escapeHtml(placeholder)}</p>`
  );
  el.remove();
}

function replaceRadios(root) {
  const radios = Array.from(root.querySelectorAll('input[type="radio"]')) as any[];
  const groups = new Map();
  let anon = 0;
  for (const radio of radios) {
    const name = radio.getAttribute("name") || `__anon_${anon++}`;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(radio);
  }

  for (const [name, group] of groups) {
    const optionStr = group.map((el) => radioOptionToken(el, root)).join(";");
    const tokens = ["radio-group"];
    if (name && !name.startsWith("__anon_")) {
      tokens.push(`name=${quoteValue(name)}`);
    }
    if (group.some((el) => el.hasAttribute("required"))) {
      tokens.push("required");
    }
    tokens.push(`options=${quoteValue(optionStr)}`);
    replaceWithPlaceholder(group[0], `[${tokens.join(" ")}]`);
    for (let i = 1; i < group.length; i++) {
      group[i].remove();
    }
  }
}

function replaceSelects(root) {
  for (const el of Array.from(root.querySelectorAll("select")) as any[]) {
    const optionStr = (Array.from(el.querySelectorAll("option")) as any[])
      .map((opt) => {
        const label = elementText(opt);
        const value =
          opt.getAttribute("value") != null ? opt.getAttribute("value") : label;
        return optionPair(value, label);
      })
      .join(";");
    replaceWithPlaceholder(
      el,
      formatControl("select", el, optionStr ? [`options=${quoteValue(optionStr)}`] : [])
    );
  }
}

function replaceTextareas(root) {
  for (const el of Array.from(root.querySelectorAll("textarea"))) {
    replaceWithPlaceholder(el, formatControl("textarea", el));
  }
}

function replaceInputs(root) {
  for (const el of Array.from(root.querySelectorAll("input")) as any[]) {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    if (SKIP_INPUT_TYPES.has(type) || type === "radio") {
      el.remove();
      continue;
    }
    if (type === "checkbox") {
      replaceWithPlaceholder(el, formatControl("checkbox", el));
      continue;
    }
    replaceWithPlaceholder(el, formatControl("text", el));
  }
}

function dropUnfillable(root) {
  for (const el of Array.from(root.querySelectorAll("button")) as any[]) {
    el.remove();
  }
}

function tidyMarkdown(text) {
  return (
    String(text || "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n"
  );
}

/**
 * Custom format: replace native fillable controls with `[kind attr=value]`
 * markers, then Turndown the rest to markdown. Ids / data-jobbot-id survive.
 *
 * @param {string} parsedHtml
 * @returns {string}
 */
export function htmlToPageText(parsedHtml) {
  if (typeof parsedHtml !== "string" || parsedHtml.trim().length === 0) {
    return "";
  }

  const root = parse(parsedHtml, { comment: false });
  dropUnfillable(root);
  replaceRadios(root);
  replaceSelects(root);
  replaceTextareas(root);
  replaceInputs(root);

  return tidyMarkdown(turndown.turndown(root.toString()));
}

/**
 * html-to-text library default: HTML -> plain text.
 * Native <input>/<select> often flatten or vanish — that is the point of
 * this A/B option. Field ids are not rewritten.
 *
 * @param {string} parsedHtml
 * @returns {string}
 */
export function htmlToPlainText(parsedHtml) {
  if (typeof parsedHtml !== "string" || parsedHtml.trim().length === 0) {
    return "";
  }

  return tidyMarkdown(
    htmlToText(parsedHtml, {
      wordwrap: false,
      preserveNewlines: true,
      selectors: [
        { selector: "img", format: "skip" },
        { selector: "a", options: { ignoreHref: true } }
      ]
    })
  );
}

/**
 * Turndown library default: HTML -> markdown, no field markers.
 * Same caveat as html-to-text: form controls may drop.
 *
 * @param {string} parsedHtml
 * @returns {string}
 */
export function htmlToMarkdown(parsedHtml) {
  if (typeof parsedHtml !== "string" || parsedHtml.trim().length === 0) {
    return "";
  }

  return tidyMarkdown(markdownTurndown.turndown(parsedHtml));
}

function childrenToJson(node) {
  const out = [];
  for (const child of node.childNodes || []) {
    const value = htmlNodeToJson(child);
    if (value == null || value === "") continue;
    if (Array.isArray(value)) out.push(...value);
    else out.push(value);
  }
  return out;
}

/**
 * One DOM node -> JSON. Tagless parser roots unwrap to their children.
 * A single text child becomes `text` instead of a one-item `children` array.
 */
function htmlNodeToJson(node) {
  if (!node) return null;

  if (node.nodeType === NodeType.TEXT_NODE) {
    const text = String(node.rawText ?? node.text ?? "")
      .replace(/\s+/g, " ")
      .trim();
    return text || null;
  }

  if (node.nodeType !== NodeType.ELEMENT_NODE) return null;

  const tag = (node.rawTagName || "").toLowerCase();
  if (!tag) return childrenToJson(node);

  const item: any = { tag };
  for (const [key, value] of Object.entries(node.attributes || {})) {
    if (value == null) continue;
    const asString = String(value);
    item[key] = asString === "" ? true : asString;
  }

  const kids = childrenToJson(node);
  if (kids.length === 1 && typeof kids[0] === "string") {
    item.text = kids[0];
  } else if (kids.length > 0) {
    item.children = kids;
  }
  return item;
}

/**
 * HTML DOM tree -> JSON -> TOON. Keeps tags/attrs (including id /
 * data-jobbot-id) in a nested object encoding, not markdown.
 *
 * @param {string} parsedHtml
 * @returns {string}
 */
export function htmlToToon(parsedHtml) {
  if (typeof parsedHtml !== "string" || parsedHtml.trim().length === 0) {
    return "";
  }

  const root = parse(parsedHtml, { comment: false });
  const tree = htmlNodeToJson(root);
  return encodeToon(tree ?? {}).trim() + "\n";
}

/**
 * Build every encoding of the stripped HTML so fill dumps can compare
 * them even when only one is sent to the LLM.
 *
 * @param {string} parsedHtml
 * @returns {{ html: string, text: string, markdown: string, toon: string, custom: string }}
 */
export function buildPageFormatVariants(parsedHtml) {
  const html = parsedHtml || "";
  return {
    html,
    text: htmlToPlainText(html),
    markdown: htmlToMarkdown(html),
    toon: htmlToToon(html),
    custom: htmlToPageText(html)
  };
}
