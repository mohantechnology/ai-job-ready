import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { downloadUsageCsv, getUsage } from "../lib/api.js";
import { formatUtcDay } from "../lib/dateRange.js";
import PageFrame from "../components/layout/PageFrame.jsx";
import RangeFilter from "../components/dashboard/RangeFilter.jsx";

const PAGE_SIZE = 25;
const COLORS = ["#2dd4bf", "#38bdf8", "#a78bfa", "#fbbf24", "#fb7185", "#34d399", "#818cf8", "#f472b6", "#fb923c", "#22d3ee"];

const FEATURE_LABELS = {
  form_fill: "Form fill",
  job_extract: "Job extract",
  job_summary: "Job summary",
  resume_prefill: "Resume prefill",
  job_research: "Job research",
  question_generation: "Question generation",
  interview_grading: "Interview grading",
  realtime_interview: "Voice interview",
};

const STATUS_STYLE = {
  success: "bg-emerald-500/15 text-emerald-300",
  failed: "bg-rose-500/15 text-rose-300",
  cancelled: "bg-slate-500/20 text-slate-300",
};

function featureLabel(feature) {
  return FEATURE_LABELS[feature] || feature || "Unknown";
}

function formatTokens(value) {
  const number = Number(value) || 0;
  const abs = Math.abs(number);
  if (abs >= 1_000_000) {
    const scaled = number / 1_000_000;
    return `${abs >= 10_000_000 ? Math.round(scaled) : trimNumber(scaled, 1)}M`;
  }
  if (abs >= 1_000) {
    const scaled = number / 1_000;
    return `${abs >= 10_000 ? Math.round(scaled) : trimNumber(scaled, 1)}k`;
  }
  return String(Math.round(number));
}

function trimNumber(number, digits) {
  return number.toFixed(digits).replace(/\.0$/, "");
}

function formatExact(value) {
  return new Intl.NumberFormat().format(Number(value) || 0);
}

function formatStamp(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: true,
  });
}

function formatDuration(ms) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${trimNumber(ms / 1000, ms >= 10_000 ? 0 : 1)} s`;
}

function modeLabel(serviceTier) {
  return String(serviceTier || "").toLowerCase() === "fast" ? "Fast" : "Standard";
}

function formatRangeLabel(start, end, range, selection) {
  if (range === "custom" && selection?.from && selection?.to) {
    return `${formatUtcDay(selection.from, true)} – ${formatUtcDay(selection.to, true)}`;
  }
  if (range === "all" || (!start && !end)) return "All time";
  const opts = { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" };
  const startLabel = start ? new Date(start).toLocaleDateString(undefined, opts) : "…";
  const endDate = end ? new Date(new Date(end).getTime() - 1) : null;
  const endLabel = endDate ? endDate.toLocaleDateString(undefined, opts) : "now";
  return `${startLabel} – ${endLabel}`;
}

function enumerateDays(from, to) {
  if (!from || !to || from > to) return [];
  const days = [];
  const [year, month, day] = from.split("-").map(Number);
  const cursor = new Date(Date.UTC(year, month - 1, day));
  const [endYear, endMonth, endDay] = to.split("-").map(Number);
  const end = Date.UTC(endYear, endMonth - 1, endDay);
  while (cursor.getTime() <= end && days.length < 400) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function buildChart(daily, groupBy, rangeStart, rangeEnd) {
  const keyOf = (row) => (groupBy === "feature" ? featureLabel(row.feature) : row.model || "Unknown");
  const totals = new Map();
  const byDay = new Map();
  for (const row of daily || []) {
    const key = keyOf(row);
    totals.set(key, (totals.get(key) || 0) + row.totalTokens);
    if (!byDay.has(row.date)) byDay.set(row.date, new Map());
    const bucket = byDay.get(row.date);
    bucket.set(key, (bucket.get(key) || 0) + row.totalTokens);
  }

  const keys = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([key]) => key);
  const dataDays = [...byDay.keys()].sort();
  const rangeFrom = rangeStart ? new Date(rangeStart).toISOString().slice(0, 10) : dataDays[0];
  const rangeTo = rangeEnd ? new Date(new Date(rangeEnd).getTime() - 1).toISOString().slice(0, 10) : dataDays[dataDays.length - 1];
  const from = rangeFrom && dataDays[0] ? (rangeFrom < dataDays[0] ? rangeFrom : dataDays[0]) : rangeFrom || dataDays[0];
  const to = rangeTo && dataDays.at(-1) ? (rangeTo > dataDays.at(-1) ? rangeTo : dataDays.at(-1)) : rangeTo || dataDays.at(-1);
  const days = enumerateDays(from, to);
  if (!days.length || !keys.length) return null;

  const running = new Map(keys.map((key) => [key, 0]));
  const points = days.map((day) => {
    const bucket = byDay.get(day) || new Map();
    const values = {};
    for (const key of keys) {
      running.set(key, running.get(key) + (bucket.get(key) || 0));
      values[key] = running.get(key);
    }
    return { day, values };
  });

  const max = Math.max(
    1,
    ...points.map((point) => keys.reduce((sum, key) => sum + point.values[key], 0))
  );

  return { keys, points, max, colors: Object.fromEntries(keys.map((key, index) => [key, COLORS[index % COLORS.length]])) };
}

function chartGeometry(chart, width, height) {
  const pad = { left: 46, right: 16, top: 18, bottom: 28 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const zeros = Object.fromEntries(chart.keys.map((key) => [key, 0]));
  const points = [{ day: "", values: zeros }, ...chart.points];
  const xAt = (index) => pad.left + (index / (points.length - 1)) * innerW;
  const yAt = (value) => pad.top + innerH - (value / chart.max) * innerH;
  const stackBelow = (point, key) =>
    chart.keys.slice(0, chart.keys.indexOf(key)).reduce((sum, name) => sum + point.values[name], 0);

  const areas = chart.keys.map((key) => {
    const upper = points.map((point, index) => ({ x: xAt(index), y: yAt(stackBelow(point, key) + point.values[key]) }));
    const lower = points.map((point, index) => ({ x: xAt(index), y: yAt(stackBelow(point, key)) }));
    const forward = upper.map((coord, index) => `${index === 0 ? "M" : "L"} ${coord.x.toFixed(1)} ${coord.y.toFixed(1)}`).join(" ");
    const back = [...lower].reverse().map((coord) => `L ${coord.x.toFixed(1)} ${coord.y.toFixed(1)}`).join(" ");
    return { key, d: `${forward} ${back} Z`, color: chart.colors[key] };
  });

  const ticks = [0, 0.5, 1].map((ratio) => ({
    y: yAt(chart.max * ratio),
    label: formatTokens(chart.max * ratio),
  }));

  const labelIndexes =
    chart.points.length <= 2
      ? chart.points.map((_, index) => index + 1)
      : [1, Math.ceil(chart.points.length / 2), chart.points.length];
  const labels = [...new Set(labelIndexes)].map((index) => ({
    x: xAt(index),
    label: formatUtcDay(points[index].day),
  }));
  const todayIndex = points.findIndex((point) => point.day === new Date().toISOString().slice(0, 10));

  return { areas, ticks, labels, xAt, pad, height, todayIndex, pointCount: points.length };
}

export default function Usage() {
  const [selection, setSelection] = useState({ range: "this_month", from: "", to: "" });
  const [offset, setOffset] = useState(0);
  const [groupBy, setGroupBy] = useState("model");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getUsage(selection, { limit: PAGE_SIZE, offset })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Could not load usage.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selection, offset]);

  const chart = useMemo(
    () => (data ? buildChart(data.daily, groupBy, data.rangeStart, data.rangeEnd) : null),
    [data, groupBy]
  );
  const geometry = useMemo(() => (chart ? chartGeometry(chart, 720, 240) : null), [chart]);
  const totals = data?.totals;
  const page = data?.page;
  const fromRow = page ? page.offset + 1 : 0;
  const toRow = page ? Math.min(page.offset + (data?.events?.length || 0), page.total) : 0;

  function selectRange(next) {
    setOffset(0);
    setHovered(null);
    setSelection(next);
  }

  async function exportCsv() {
    setExporting(true);
    setError("");
    try {
      await downloadUsageCsv(selection);
    } catch (err) {
      setError(err.message || "Could not export usage.");
    } finally {
      setExporting(false);
    }
  }

  const hoveredPoint = hovered != null && chart ? chart.points[hovered] : null;

  return (
    <div className="min-h-full">
      <PageFrame className="flex flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-white">Usage</h1>
            <p className="text-xs text-slate-500">
              {data ? formatRangeLabel(data.rangeStart, data.rangeEnd, data.range, selection) : "Token use for this account"}
            </p>
          </div>
          <RangeFilter value={selection} onChange={selectRange} />
        </header>

        {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
        {loading && <div className="h-64 animate-pulse rounded-2xl bg-white/[0.04]" />}

        {!loading && data && totals && (
          <div key={`${selection.range}:${selection.from}:${selection.to}:${offset}`} className="space-y-5">
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Total tokens" value={formatTokens(totals.totalTokens)} detail={formatExact(totals.totalTokens)} />
              <StatCard label="Input tokens" value={formatTokens(totals.inputTokens)} detail={`${formatExact(totals.cachedInputTokens)} cache read`} />
              <StatCard label="Output tokens" value={formatTokens(totals.outputTokens)} detail={`${formatExact(totals.reasoningTokens)} reasoning`} />
              <StatCard
                label="Requests"
                value={formatExact(totals.requests)}
                detail={`${formatExact(totals.succeeded)} succeeded · ${formatExact(totals.failed)} failed`}
              />
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-white">Your usage</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Cumulative tokens by day</p>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  Group by
                  <select
                    value={groupBy}
                    onChange={(event) => {
                      setHovered(null);
                      setGroupBy(event.target.value);
                    }}
                    className="rounded-lg border border-white/10 bg-[#141414] px-2.5 py-1.5 text-xs text-slate-200 outline-none"
                  >
                    <option value="model">Model</option>
                    <option value="feature">Feature</option>
                  </select>
                </label>
              </div>

              {!chart || !geometry ? (
                <p className="py-16 text-center text-sm text-slate-500">No model usage in this period yet.</p>
              ) : (
                <>
                  <UsageChart
                    chart={chart}
                    geometry={geometry}
                    hovered={hovered}
                    setHovered={setHovered}
                    hoveredPoint={hoveredPoint}
                  />
                  <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                    {chart.keys.map((key) => (
                      <li key={key} className="flex items-center gap-2 text-xs text-slate-400">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: chart.colors[key] }} />
                        <span className="text-slate-300">{key}</span>
                        <span>{formatTokens(chart.points.at(-1)?.values[key] || 0)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={exportCsv}
                disabled={exporting || !totals.requests}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:text-slate-500"
              >
                <Download className="h-3.5 w-3.5" />
                {exporting ? "Exporting…" : "Export CSV"}
              </button>
            </div>

            <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
              <div className="overflow-x-auto">
                <table className="min-w-[960px] w-full text-left text-sm">
                  <thead className="text-xs text-slate-500">
                    <tr className="border-b border-white/10">
                      {["Date (UTC)", "Feature", "Model", "Mode", "Input", "Cache read", "Output", "Reasoning", "Audio in", "Audio out", "Total", "Status", "Duration"].map((label) => (
                        <th key={label} className="px-4 py-3 font-medium">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.events.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="px-4 py-12 text-center text-sm text-slate-500">
                          No requests in this period. Usage shows up after a form fill, job save, or interview.
                        </td>
                      </tr>
                    ) : (
                      data.events.map((event) => (
                        <tr key={event.id} className="border-b border-white/5 last:border-0">
                          <td className="whitespace-nowrap px-4 py-3 text-slate-300">{formatStamp(event.createdAt)}</td>
                          <td className="px-4 py-3 text-slate-200">{featureLabel(event.feature)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-300">{event.model || "—"}</td>
                          <td className="px-4 py-3 text-slate-300">{modeLabel(event.serviceTier)}</td>
                          <td className="px-4 py-3 tabular-nums text-slate-300" title={formatExact(event.inputTokens)}>
                            {formatTokens(event.inputTokens)}
                          </td>
                          <td className="px-4 py-3 tabular-nums text-slate-300" title={formatExact(event.cachedInputTokens)}>
                            {formatTokens(event.cachedInputTokens)}
                          </td>
                          <td className="px-4 py-3 tabular-nums text-slate-300" title={formatExact(event.outputTokens)}>
                            {formatTokens(event.outputTokens)}
                          </td>
                          <td className="px-4 py-3 tabular-nums text-slate-300" title={formatExact(event.reasoningTokens)}>
                            {formatTokens(event.reasoningTokens)}
                          </td>
                          <td className="px-4 py-3 tabular-nums text-slate-300" title={formatExact(event.audioInputTokens)}>
                            {formatTokens(event.audioInputTokens)}
                          </td>
                          <td className="px-4 py-3 tabular-nums text-slate-300" title={formatExact(event.audioOutputTokens)}>
                            {formatTokens(event.audioOutputTokens)}
                          </td>
                          <td className="px-4 py-3 tabular-nums text-white" title={formatExact(event.totalTokens)}>
                            {formatTokens(event.totalTokens)}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_STYLE[event.status] || STATUS_STYLE.cancelled}`}>
                              {event.status}
                            </span>
                            {event.errorMessage && (
                              <p className="mt-1 max-w-[16rem] truncate text-[11px] text-slate-500" title={event.errorMessage}>
                                {event.errorMessage}
                              </p>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-400">{formatDuration(event.durationMs)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {page && page.total > PAGE_SIZE && (
                <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-xs text-slate-400">
                  <span>
                    {fromRow}–{toRow} of {formatExact(page.total)}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={page.offset === 0}
                      onClick={() => setOffset(Math.max(0, page.offset - PAGE_SIZE))}
                      className="rounded-lg border border-white/10 px-2.5 py-1 text-slate-200 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:text-slate-600"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={page.offset + PAGE_SIZE >= page.total}
                      onClick={() => setOffset(page.offset + PAGE_SIZE)}
                      className="rounded-lg border border-white/10 px-2.5 py-1 text-slate-200 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:text-slate-600"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </PageFrame>
    </div>
  );
}

function StatCard({ label, value, detail }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function UsageChart({ chart, geometry, hovered, setHovered, hoveredPoint }) {
  const width = 720;
  const { areas, ticks, labels, xAt, pad, height, todayIndex } = geometry;

  function onMove(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - bounds.left) / bounds.width;
    const x = ratio * width;
    let nearest = 0;
    let best = Infinity;
    chart.points.forEach((_, index) => {
      const distance = Math.abs(xAt(index + 1) - x);
      if (distance < best) {
        best = distance;
        nearest = index;
      }
    });
    setHovered(nearest);
  }

  return (
    <div className="relative mt-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-60 w-full"
        role="img"
        aria-label="Cumulative token usage"
        onMouseMove={onMove}
        onMouseLeave={() => setHovered(null)}
      >
        {ticks.map((tick) => (
          <g key={tick.label}>
            <line x1={pad.left} x2={width - 12} y1={tick.y} y2={tick.y} stroke="rgba(255,255,255,0.08)" />
            <text x={pad.left - 8} y={tick.y + 3} textAnchor="end" className="fill-slate-500 text-[10px]">
              {tick.label}
            </text>
          </g>
        ))}
        {areas.map((area) => (
          <path key={area.key} d={area.d} fill={area.color} fillOpacity="0.85" />
        ))}
        {todayIndex >= 0 && (
          <g>
            <line
              x1={xAt(todayIndex)}
              x2={xAt(todayIndex)}
              y1={pad.top}
              y2={height - pad.bottom}
              stroke="rgba(226,232,240,0.45)"
              strokeDasharray="3 3"
            />
            <text x={xAt(todayIndex)} y={12} textAnchor="middle" className="fill-slate-300 text-[10px]">
              Today
            </text>
          </g>
        )}
        {hovered != null && (
          <line
            x1={xAt(hovered + 1)}
            x2={xAt(hovered + 1)}
            y1={pad.top}
            y2={height - pad.bottom}
            stroke="rgba(255,255,255,0.35)"
          />
        )}
        {labels.map((label) => (
          <text key={label.label} x={label.x} y={height - 8} textAnchor="middle" className="fill-slate-500 text-[10px]">
            {label.label}
          </text>
        ))}
      </svg>
      {hoveredPoint && (
        <div className="pointer-events-none absolute right-2 top-2 rounded-xl border border-white/10 bg-[#141414]/95 px-3 py-2 text-xs shadow-xl">
          <p className="font-medium text-slate-200">{formatUtcDay(hoveredPoint.day, true)}</p>
          <ul className="mt-1 space-y-1">
            {chart.keys.map((key) => (
              <li key={key} className="flex items-center justify-between gap-4 text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: chart.colors[key] }} />
                  {key}
                </span>
                <span className="tabular-nums text-slate-200">{formatTokens(hoveredPoint.values[key])}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
