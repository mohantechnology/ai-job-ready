export const RANGE_OPTIONS = [
  { id: "this_week", label: "This week" },
  { id: "last_week", label: "Last week" },
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "all", label: "All time" },
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value) {
  if (!ISO_DATE.test(value || "")) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function normalizeRange(input) {
  const range = input?.range;
  const from = input?.from || "";
  const to = input?.to || "";
  if (range === "custom" && isIsoDate(from) && isIsoDate(to) && from <= to) {
    return { range: "custom", from, to };
  }
  if (RANGE_OPTIONS.some((item) => item.id === range)) {
    return { range, from: "", to: "" };
  }
  return { range: "this_week", from: "", to: "" };
}

export function rangeSearchParams(selection) {
  const normalized = normalizeRange(selection);
  const params = new URLSearchParams({ range: normalized.range });
  if (normalized.range === "custom") {
    params.set("from", normalized.from);
    params.set("to", normalized.to);
  }
  return params;
}

export function formatUtcDay(iso, withYear = false) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

export function rangeCaption(selection) {
  const normalized = normalizeRange(selection);
  if (normalized.range === "custom") {
    return `${formatUtcDay(normalized.from)} – ${formatUtcDay(normalized.to)}`;
  }
  return RANGE_OPTIONS.find((item) => item.id === normalized.range)?.label || "This week";
}

export function todayUtcIso() {
  return new Date().toISOString().slice(0, 10);
}
