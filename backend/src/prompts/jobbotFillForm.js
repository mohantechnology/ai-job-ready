import { createHash } from "crypto";
// TOON experiment — comment this import if reverting serializeUserDetailsForPrompt to JSON.stringify.
import { encode as encodeToon } from "@toon-format/toon";
import { getUserDetails } from "../repositories/userProfile.repository.js";
import { parsePageHtml, writeDebugOutput } from "../lib/jobbotHtmlParser.js";
import { buildPageFormatVariants } from "../lib/jobbotHtmlToPageText.js";

// Ported from job-bot/backend/src/prompts/fillForm.js as part of merging the
// job-bot extension's backend into this one. `getUserDetails` now reads the
// `user_profile` Postgres table instead of a flat JSON file (see
// repositories/userProfile.repository.js) - everything else is unchanged.

// Bound on the *parsed* page payload (scripts/styles/media already stripped),
// so this can be larger than the old 30k raw-HTML cap without wasting tokens.
export const MAX_PAGE_HTML_CHARS = 80000;

// ---------------------------------------------------------------------------
// Page encoding sent to the LLM.
// Change ONLY this field to A/B test token cost vs fill quality.
//
//   "html"     — stripped HTML from parsePageHtml (original payload)
//   "text"     — html-to-text: plain text (library default; inputs may drop)
//   "markdown" — turndown: markdown (library default; inputs may drop)
//   "toon"     — HTML DOM tree encoded with @toon-format/toon
//   "custom"   — our format: turndown + [kind id=...] field markers
//
// Every fill still dumps all variants under backend/output/input/ so you
// can compare without switching.
// ---------------------------------------------------------------------------
export const PAGE_FORMAT = "custom";

// Shared across LLM providers so a slow/hung call can never leave the
// extension's fill request hanging past its own timeout budget.
export const FILL_LLM_TIMEOUT_MS = 60_000 + 3 * 60_000;

// "skip" is intentionally NOT offered to the model anymore (every field must
// get a real answer now - see the prompt) but is still accepted here as a
// defensive fallback in case the model emits it anyway; the extension's
// `fillFields` already knows how to handle it (watches the field for a
// manual answer instead of applying nothing).
export const VALID_ACTIONS = new Set(["type", "select", "check", "uncheck", "skip"]);
export const VALID_KINDS = new Set(["text", "textarea", "select", "checkbox", "radio-group"]);

// Provider-agnostic JSON shape. OpenAI uses this as `json_schema`; other
// LLMs (Cursor, Anthropic, ...) get it inlined in the prompt.
export const FILL_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    answers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: ["string", "null"] },
          given_id: { type: ["string", "null"] },
          label: { type: "string" },
          kind: {
            type: "string",
            enum: ["text", "textarea", "select", "checkbox", "radio-group"]
          },
          action: {
            type: "string",
            enum: ["type", "select", "check", "uncheck"]
          },
          required: { type: "boolean" },
          options: {
            type: ["array", "null"],
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: { type: ["string", "null"] },
                given_id: { type: ["string", "null"] },
                label: { type: "string" },
                value: { type: "string" }
              },
              required: ["id", "given_id", "label", "value"]
            }
          },
          answer: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                confidence: { type: "integer" },
                value: { type: ["string", "null"] },
                guessed: { type: "boolean" }
              },
              required: ["confidence", "value", "guessed"]
            }
          }
        },
        required: [
          "id",
          "given_id",
          "label",
          "kind",
          "action",
          "required",
          "options",
          "answer"
        ]
      }
    }
  },
  required: ["answers"]
};

export const INSTRUCTIONS = `You fill web form fields on a job application page for the candidate described in the user messages.
You will be given the page as either parsed HTML (tags, attributes, id, and text) or markdown where fillable controls are compact markers such as [text id=full-name required], [select id=position options="developer=Software Developer"], [radio-group name=work-type options="id=remote:remote=Remote;id=onsite:onsite=On-site"], [checkbox id=terms required], [textarea id=cover-letter]. In markdown, copy id= / given_id= from the marker verbatim (same rules as HTML id / data-jobbot-id). Surrounding text is job/company copy and field labels. Find every fillable field that belongs to the job application yourself (text/email/tel/number/date inputs, textareas, selects, checkboxes, radio inputs) - ignore hidden inputs and any button/submit/file inputs.

Only consider fields that are part of the actual job application (the apply form, application modal, or the section where the candidate submits their details). Ignore page chrome even when those elements are technically fillable. Do NOT emit answers[] entries for:
- Search bars and keyword/location/"search jobs"/"find jobs"/"search this site" fields used to navigate or filter listings
- Header, navbar, sidebar, or footer controls (site search, department/location filters, language switchers, type="search" / role="search")
- Login, sign-up, subscribe/newsletter, cookie-consent, or other non-application widgets
- Any input whose purpose is browsing or navigating the site rather than answering an application question
If a field sits in a <nav>, <header>, <footer>, or a search form, treat it as irrelevant unless it is clearly part of the application form.

Return ONLY a JSON object of the shape:
{
  "answers": [ { "id"?: string, "given_id"?: string, "label": string, "kind": "text"|"textarea"|"select"|"checkbox"|"radio-group", "action": "type"|"select"|"check"|"uncheck", "required"?: boolean, "options"?: [{"id"?: string, "given_id"?: string, "label": string, "value": string}], "answer": [{"confidence": number, "value"?: string, "guessed": boolean}] } ]
}
with exactly one entry per application-form field GROUP you find in "answers" - no extra entries, no missing application fields, and no chrome/search/nav fields. Radio inputs that share the same "name" attribute are ONE field group ("kind": "radio-group") - never emit a separate entry per individual radio.

Use "Page meta" (url, title, og tags, heading) plus the page content itself as context for the role and company. Do not emit job_details or company_details.

For each answers[] entry's "id"/"given_id" (identifies the field's own element):
- If the control has a native id (HTML id="..." or a marker's id=), set "id" to that exact value (copy it verbatim, do not invent or modify it).
- Otherwise it will have given_id (HTML data-jobbot-id="..." or a marker's given_id=) - set "given_id" to that exact value (copy it verbatim). Every element without a native id is guaranteed to have this attribute, so "given_id" should always be findable.
- Never invent an "id"/"given_id" that isn't literally present in the page content.
- Exception - "radio-group": the group itself is not one DOM element, so omit the entry's own "id"/"given_id" entirely. Instead, every object in "options" must carry the "id" or "given_id" of that specific radio input (same rule as above, applied per-option).

Other fields on each answers[] entry:
- "label": the exact question/label text as it appears on the page for this field (not a paraphrase).
- "kind": the element's real HTML tag/type - one of "text" (any text-like input: text/email/tel/number/date/url/etc.), "textarea", "select", "checkbox", "radio-group" (a group of same-name radio inputs).
- "required": true if the element has a required attribute (or is otherwise clearly marked mandatory on the page), else false.
- "options": for "select", the real options you saw (HTML <option>s, or the marker's options="value=label;..."). For "radio-group", one object per radio in the group (label = that radio's own visible label text, value = its value attribute, plus its id/given_id as described above). Omit "options" for "text"/"textarea"/"checkbox".

EVERY application field must get a real answer - there is no "skip". Even when the candidate profile has nothing directly on point, put your single best, realistic, low-stakes guess in "answer[0].value" so the person reviewing the form always has something to look at (and change) instead of an empty field. This applies to every kind, including "select"/"radio-group" (pick the closest of the real listed options) and "checkbox"/"radio-group" choices with real consequences (citizenship, sponsorship, etc.) - guess your best real-world default there too, never leave it blank.

"answer" is always an array with exactly ONE object { "confidence": number, "value"?: string, "guessed": boolean }, and "confidence"/"guessed" are independent of each other - judge them separately:
- "confidence" (integer 0-10): purely how sure you are that "value" is actually correct/appropriate for this field, regardless of where it came from. 10 = certain, 0 = a total shot in the dark.
- "guessed" (boolean): whether "value" is actually grounded in the candidate's real data, not how confident you are in it.
  - false: the value is a fact taken directly from the candidate profile/notes, OR it's the closest real option among what the page actually offers to a fact you do know (e.g. the candidate's real job title is "Full Stack Developer" and the page's <select> only offers "Software Developer" as an option - picking "Software Developer" is a match against a real fact via the page's limited choices, so "guessed" is false, even though it's not a verbatim string match).
  - true: you had NO supporting fact anywhere in the candidate profile/notes for this field and invented a plausible value purely so the field isn't left empty.
- "value": REQUIRED for every kind except "checkbox" (a checkbox's "check"/"uncheck" action already carries the answer) - always fill it in per the action rules below, never omit it just because you're unsure; a low "confidence" + "guessed": true is how you flag uncertainty instead.

Action rules, based on "kind":
- "text" / "textarea": action must be "type", with "answer[0].value" set to the text to enter.
- "select": action must be "select", with "answer[0].value" set to exactly one of that select's real <option> values or visible text as it appears in the HTML - never invent an option that isn't listed.
- "checkbox": action must be "check" or "uncheck" (omit "answer[0].value") - always pick one, based on the best real-world default for this candidate/question when there's no direct fact.
- "radio-group": action must be "check", with "answer[0].value" set to exactly one of that group's "options" values (the option you want selected) - never invent an option that isn't listed. Never use "uncheck" on a radio-group.

Tailor any free-text answers (summary, cover letter, "why this role/company", etc.) specifically to the job and company described on the page - avoid a generic answer when that context lets you be specific.
The structured candidate profile has two arrays of { "label", "answer": ["value", ...] } records:
- "details": the candidate's canonical profile. Match form questions against "label"; "answer" may contain multiple values (education, skills, work history).
- "newDetails": answers the candidate later confirmed on real forms. Treat these as additional facts, and prefer them over "details" when the same label appears in both.
Prefer that structured profile for exact facts (name, email, phone, links, dates, etc.). Use the free-text profile notes for anything the structured profile doesn't cover.`;

/**
 * Drop `key` and flatten `answer: [{ value }]` to `answer: ["value", ...]`
 * so the LLM payload is smaller. The stored `user_profile` row is unchanged.
 */
export function slimUserDetailsForPrompt(userDetails) {
  const slimRecords = (records) =>
    (Array.isArray(records) ? records : [])
      .filter((record) => record && typeof record === "object")
      .map((record) => {
        const label = typeof record.label === "string" ? record.label : "";
        const rawAnswer = Array.isArray(record.answer) ? record.answer : [];
        const answer = rawAnswer
          .map((item) => {
            if (typeof item === "string") return item.trim();
            if (item && typeof item === "object" && item.value != null) {
              return String(item.value).trim();
            }
            return "";
          })
          .filter(Boolean);
        return { label, answer };
      })
      .filter((record) => record.label && record.answer.length > 0);

  return {
    details: slimRecords(userDetails?.details),
    newDetails: slimRecords(userDetails?.newDetails)
  };
}

/**
 * Serialize the slim profile for the fill prompt.
 * TOON is on for a token-count experiment — comment the `encodeToon` return
 * and uncomment `JSON.stringify` to revert (also comment the import at top).
 */
export function serializeUserDetailsForPrompt(userDetails) {
  const slim = slimUserDetailsForPrompt(userDetails);

  // TOON experiment (comment this line + uncomment JSON.stringify to disable):
  // return encodeToon(slim);
  return JSON.stringify(slim);
}

export function promptCacheKey(userDetails, profile) {
  const digest = createHash("sha256")
    .update(serializeUserDetailsForPrompt(userDetails))
    .update("\n")
    .update(profile || "")
    .digest("hex")
    .slice(0, 16);
  return `jobbot:fill:v2:${digest}`;
}

export function buildFillMessages(userDetails, profile, meta, pageContent, pageFormat = "html") {
  const candidateProfile = [
    "Structured candidate profile. `details` is the canonical profile; `newDetails` are facts the candidate later confirmed on real forms (prefer newDetails on overlap):",
    serializeUserDetailsForPrompt(userDetails),
    "",
    "Free-text profile notes from the candidate:",
    profile || "(none provided)"
  ].join("\n");

  const pageHeaders = {
    html: "Parsed page HTML (find and answer every fillable application field in here yourself; ignore search/nav chrome):",
    text: "Page content (plain text via html-to-text; find fillable fields from labels and nearby text; copy any id/given_id if present; ignore search/nav chrome):",
    markdown: "Page content (markdown via Turndown; find fillable fields from labels and nearby text; copy any id/given_id if present; ignore search/nav chrome):",
    toon: "Page content (HTML tree encoded as TOON; tags/attrs/id/data-jobbot-id are in the tree; find and answer every fillable field; ignore search/nav chrome):",
    custom: "Page content (markdown; fillable fields are [kind attr=value] markers — copy id/given_id from those markers verbatim; ignore search/nav chrome):"
  };
  const pageHeader =
    pageHeaders[pageFormat] || pageHeaders.html;

  const pageBlock = [
    "Page meta (JSON):",
    JSON.stringify(meta && typeof meta === "object" ? meta : {}),
    "",
    pageHeader,
    pageContent || "(none provided)",
    "",
    `Current date: ${new Date().toDateString()}`
  ].join("\n");

  return [
    { role: "system", content: INSTRUCTIONS },
    { role: "user", content: candidateProfile },
    { role: "user", content: pageBlock }
  ];
}

/**
 * Flatten chat-style messages into one prompt string for providers that
 * don't take a messages array (Cursor Agent, some Anthropic wrappers, etc.).
 */
export function fillMessagesToPrompt(messages) {
  const body = (messages || [])
    .map((message) => String(message?.content || "").trim())
    .filter(Boolean)
    .join("\n\n");

  return [
    body,
    "Output rules:",
    "- Reply with a single JSON object only. No markdown fences, no commentary, no tool use, no file edits.",
    "- The JSON must match this schema:",
    JSON.stringify(FILL_RESPONSE_SCHEMA)
  ].join("\n");
}

/**
 * Parse HTML, load the candidate record, and build the shared fill prompt.
 * Used by every LLM provider so they all see the same instructions + schema.
 */
export async function prepareFillRequest(pageHtml, profile, meta) {
  const userDetails = await getUserDetails();
  const parsedHtml = parsePageHtml(pageHtml);
  const variants = buildPageFormatVariants(parsedHtml);

  // Pick which encoding the LLM sees. PAGE_FORMAT is the only switch.
  // Unknown values fall back to stripped HTML so a typo cannot blank the prompt.
  let pageForLlm = variants.html;
  let pageFormat = "html";
  if (PAGE_FORMAT === "html") {
    // Original stripped HTML (tags + identifying attrs + text).
    pageForLlm = variants.html;
    pageFormat = "html";
  } else if (PAGE_FORMAT === "text") {
    // html-to-text npm package → plain text.
    pageForLlm = variants.text;
    pageFormat = "text";
  } else if (PAGE_FORMAT === "markdown") {
    // turndown npm package → markdown (no field markers).
    pageForLlm = variants.markdown;
    pageFormat = "markdown";
  } else if (PAGE_FORMAT === "toon") {
    // DOM tree → JSON → @toon-format/toon.
    pageForLlm = variants.toon;
    pageFormat = "toon";
  } else if (PAGE_FORMAT === "custom") {
    // Our compact markers + turndown (current default).
    pageForLlm = variants.custom;
    pageFormat = "custom";
  }

  const truncatedHtml = pageForLlm.slice(0, MAX_PAGE_HTML_CHARS);

  await writeDebugOutput({
    "input/page.html": pageHtml || "",
    "input/parsed.html": variants.html,
    "input/parsed-text.txt": variants.text,
    "input/parsed-markdown.md": variants.markdown,
    "input/parsed.toon": variants.toon,
    "input/parsedHtmlText.txt": variants.custom
  });

  const messages = buildFillMessages(
    userDetails,
    profile,
    meta,
    truncatedHtml,
    pageFormat
  );
  const cacheKey = promptCacheKey(userDetails, profile);

  return {
    userDetails,
    parsedHtml,
    parsedHtmlText: variants.custom,
    truncatedHtml,
    pageFormat,
    messages,
    cacheKey
  };
}

/**
 * Models without a strict JSON mode often wrap the object in markdown
 * fences or preface it with a sentence. Pull out the first parseable object.
 */
export function parseLlmJson(raw) {
  if (typeof raw !== "string" || !raw.trim()) return {};

  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      // fall through
    }
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      // fall through
    }
  }

  return {};
}

export function normalizeFillOutput(parsed) {
  // Prompt asks for "answers"; accept "answer" too in case the model follows
  // the older/singular wording.
  const rawAnswers = Array.isArray(parsed?.answers)
    ? parsed.answers
    : Array.isArray(parsed?.answer)
      ? parsed.answer
      : [];

  const answers = rawAnswers
    .filter(
      (answer) =>
        answer &&
        VALID_ACTIONS.has(answer.action) &&
        // "radio-group" entries have no element of their own (see prompt) -
        // they're identified via their options' ids instead, so they don't
        // need a top-level id/given_id to be valid. Accept both snake_case
        // (prompt) and camelCase (models sometimes ignore the prompt's
        // naming) so a valid answer isn't dropped before it reaches the
        // extension.
        (typeof answer.id === "string" ||
          typeof answer.given_id === "string" ||
          typeof answer.givenId === "string" ||
          answer.kind === "radio-group")
    )
    .map((answer) => {
      const givenId =
        typeof answer.given_id === "string"
          ? answer.given_id
          : typeof answer.givenId === "string"
            ? answer.givenId
            : undefined;

      // Models sometimes emit `answer` as a bare object instead of the
      // requested one-item array - normalize both shapes so we don't wipe
      // a real value and send `{confidence:0,guessed:true}` with no value.
      const rawDetail = Array.isArray(answer.answer)
        ? answer.answer[0]
        : answer.answer && typeof answer.answer === "object"
          ? answer.answer
          : undefined;

      return {
        ...(typeof answer.id === "string" ? { id: answer.id } : {}),
        ...(givenId ? { givenId } : {}),
        ...(typeof answer.label === "string" ? { label: answer.label } : {}),
        ...(VALID_KINDS.has(answer.kind) ? { kind: answer.kind } : {}),
        action: answer.action,
        ...(typeof answer.required === "boolean" ? { required: answer.required } : {}),
        ...(Array.isArray(answer.options)
          ? {
            options: answer.options
              .filter((opt) => opt && typeof opt.value === "string")
              .map((opt) => {
                const optGivenId =
                  typeof opt.given_id === "string"
                    ? opt.given_id
                    : typeof opt.givenId === "string"
                      ? opt.givenId
                      : undefined;
                return {
                  ...(typeof opt.id === "string" ? { id: opt.id } : {}),
                  ...(optGivenId ? { givenId: optGivenId } : {}),
                  label: String(opt.label ?? opt.value),
                  value: opt.value
                };
              })
          }
          : {}),
        answer: rawDetail
          ? [
            {
              confidence:
                typeof rawDetail.confidence === "number" ? rawDetail.confidence : 0,
              ...(typeof rawDetail.value === "string" ? { value: rawDetail.value } : {}),
              guessed: typeof rawDetail.guessed === "boolean" ? rawDetail.guessed : true
            }
          ]
          : [{ confidence: 0, guessed: true }]
      };
    });

  return { answers };
}
