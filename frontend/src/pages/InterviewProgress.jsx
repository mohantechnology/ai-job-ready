import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { getProgress } from "../lib/api.js";
import { formatUtcDay, normalizeRange } from "../lib/dateRange.js";
import PageFrame from "../components/layout/PageFrame.jsx";
import RangeFilter from "../components/dashboard/RangeFilter.jsx";

function masteryMeta(avgScore) {
  if (avgScore == null) return { label: "No scores yet", tone: "muted" };
  if (avgScore >= 8) return { label: "Strong", tone: "strong" };
  if (avgScore >= 6) return { label: "Solid", tone: "solid" };
  if (avgScore >= 4) return { label: "Developing", tone: "developing" };
  return { label: "Needs work", tone: "weak" };
}

const TONE = {
  strong: { text: "text-teal-300", soft: "bg-teal-400/15 text-teal-200", bar: "from-teal-300 to-cyan-400" },
  solid: { text: "text-sky-300", soft: "bg-sky-400/15 text-sky-200", bar: "from-sky-300 to-indigo-400" },
  developing: { text: "text-amber-300", soft: "bg-amber-400/15 text-amber-200", bar: "from-amber-300 to-orange-400" },
  weak: { text: "text-rose-300", soft: "bg-rose-400/15 text-rose-200", bar: "from-rose-400 to-pink-400" },
  muted: { text: "text-slate-400", soft: "bg-slate-700/40 text-slate-300", bar: "from-slate-500 to-slate-400" },
};

function formatRangeLabel(start, end, range, selection) {
  if (range === "custom" && selection?.from && selection?.to) {
    return `${formatUtcDay(selection.from, true)} – ${formatUtcDay(selection.to, true)}`;
  }
  if (range === "all" || (!start && !end)) return "All time";
  const opts = { month: "short", day: "numeric", year: "numeric" };
  const startLabel = start ? new Date(start).toLocaleDateString(undefined, opts) : "…";
  const endLabel = end ? new Date(end).toLocaleDateString(undefined, opts) : "now";
  return `${startLabel} – ${endLabel}`;
}

function buildChartPaths(points, width, height, padX = 8, padY = 16) {
  if (!points.length) return { line: "", area: "", dots: [] };
  const max = Math.max(100, ...points.map((point) => point.avgScore || 0));
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const coords = points.map((point, index) => {
    const x = padX + (points.length === 1 ? innerW / 2 : (index / (points.length - 1)) * innerW);
    const y = padY + innerH - ((point.avgScore || 0) / max) * innerH;
    return { x, y, ...point };
  });
  const line = coords.map((coord, index) => `${index === 0 ? "M" : "L"} ${coord.x.toFixed(1)} ${coord.y.toFixed(1)}`).join(" ");
  const area = `${line} L ${coords[coords.length - 1].x.toFixed(1)} ${(height - 4).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(height - 4).toFixed(1)} Z`;
  return { line, area, dots: coords };
}

export default function InterviewProgress() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rangeParam = searchParams.get("range") || "this_week";
  const fromParam = searchParams.get("from") || "";
  const toParam = searchParams.get("to") || "";
  const selection = useMemo(
    () => normalizeRange({ range: rangeParam, from: fromParam, to: toParam }),
    [rangeParam, fromParam, toParam]
  );
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedTopic, setExpandedTopic] = useState(null);
  const [hoveredPoint, setHoveredPoint] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getProgress(selection)
      .then((payload) => {
        if (!cancelled) {
          setData(payload);
          setExpandedTopic(null);
          setHoveredPoint(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Could not load progress.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selection]);

  const conceptsByTopic = useMemo(() => {
    const map = new Map();
    for (const concept of data?.concepts || []) {
      if (!map.has(concept.topic)) map.set(concept.topic, []);
      map.get(concept.topic).push(concept);
    }
    return map;
  }, [data]);

  const chart = useMemo(() => buildChartPaths(data?.scoreTrend || [], 640, 160), [data]);
  const topics = data?.topics || [];
  const strongest = topics.length ? [...topics].sort((a, b) => b.avgScore - a.avgScore)[0] : null;
  const weakest = topics.length ? [...topics].sort((a, b) => a.avgScore - b.avgScore)[0] : null;
  const summary = data?.summary;
  const avg = summary?.avgOverallScore;

  function selectRange(next) {
    if (next.range === "custom") {
      setSearchParams({ range: "custom", from: next.from, to: next.to });
      return;
    }
    setSearchParams({ range: next.range });
  }

  return (
    <div className="min-h-full">
      <PageFrame className="flex flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-lg font-semibold text-white">Interview progress</h1>
              {data && (
                <p className="text-xs text-slate-500">{formatRangeLabel(data.rangeStart, data.rangeEnd, data.range, selection)}</p>
              )}
            </div>
          </div>
          <RangeFilter value={selection} onChange={selectRange} />
        </header>

        {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
        {loading && <div className="h-64 animate-pulse rounded-2xl bg-white/[0.04]" />}

        {!loading && data && summary && (
          <div key={`${selection.range}:${selection.from}:${selection.to}`} className="space-y-5">
            <section className="rounded-[1.75rem] border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.02] px-5 py-7 sm:px-8">
              <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
                <ScoreDial score={avg} interviews={summary.interviewsCompleted} />
                <div className="grid w-full flex-1 grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
                  <PracticeStat label="Interviews" value={summary.interviewsCompleted} />
                  <PracticeStat label="Questions" value={summary.questionsAnswered} />
                  <PracticeStat label="Topics" value={summary.topicsPracticed} />
                  <PracticeStat label="Concepts" value={summary.conceptsPracticed} />
                </div>
              </div>
              {strongest && (
                <div className="mt-8 flex flex-col gap-4 border-t border-white/10 pt-5 sm:flex-row">
                  <Insight label="Strongest topic" topic={strongest.topic} score={strongest.avgScore} tone="strong" />
                  {weakest && weakest.topic !== strongest.topic && (
                    <Insight label="Focus next" topic={weakest.topic} score={weakest.avgScore} tone="weak" />
                  )}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-white">Score over time</h2>
              <p className="mt-0.5 text-xs text-slate-500">Average overall interview score by day</p>
              {data.scoreTrend.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-500">No graded interviews in this period.</p>
              ) : (
                <ScoreChart trend={data.scoreTrend} chart={chart} hoveredPoint={hoveredPoint} setHoveredPoint={setHoveredPoint} />
              )}
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-white">Topic mastery</h2>
              <p className="mt-0.5 text-xs text-slate-500">Average question score out of 10. Open a topic to see concepts.</p>
              {topics.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-500">No graded topic scores in this period.</p>
              ) : (
                <ul className="mt-2 divide-y divide-white/5">
                  {topics.map((topic) => {
                    const open = expandedTopic === topic.topic;
                    const concepts = conceptsByTopic.get(topic.topic) || [];
                    const meta = masteryMeta(topic.avgScore);
                    const tone = TONE[meta.tone];
                    const width = Math.max(4, Math.min(100, (topic.avgScore / 10) * 100));
                    return (
                      <li key={topic.topic}>
                        <button
                          type="button"
                          onClick={() => setExpandedTopic(open ? null : topic.topic)}
                          className="flex w-full items-center gap-3 py-3 text-left"
                        >
                          <span className={`w-10 shrink-0 text-sm font-semibold tabular-nums ${tone.text}`}>
                            {topic.avgScore.toFixed(1)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium text-white">{topic.topic}</span>
                              <span className={`hidden rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide sm:inline ${tone.soft}`}>
                                {meta.label}
                              </span>
                            </span>
                            <span className="mt-1 block text-[11px] text-slate-500">
                              {topic.timesAsked} question{topic.timesAsked === 1 ? "" : "s"} · last {topic.lastScore}/10
                            </span>
                            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-800">
                              <span className={`block h-full rounded-full bg-gradient-to-r ${tone.bar}`} style={{ width: `${width}%` }} />
                            </span>
                          </span>
                          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? "rotate-180 text-teal-300" : ""}`} />
                        </button>
                        {open && (
                          <ul className="mb-3 space-y-2.5 pl-10 sm:pl-12">
                            {concepts.length === 0 ? (
                              <li className="text-xs text-slate-500">No concept scores for this topic.</li>
                            ) : (
                              concepts.map((concept) => {
                                const conceptTone = TONE[masteryMeta(concept.avgScore).tone];
                                const conceptWidth = Math.max(4, Math.min(100, (concept.avgScore / 10) * 100));
                                return (
                                  <li key={`${concept.topic}:${concept.concept}`} className="flex items-center gap-3">
                                    <span className="min-w-0 flex-1 truncate text-xs text-slate-300">{concept.concept}</span>
                                    <span className="h-1 w-24 overflow-hidden rounded-full bg-slate-800 sm:w-40">
                                      <span
                                        className={`block h-full rounded-full bg-gradient-to-r ${conceptTone.bar}`}
                                        style={{ width: `${conceptWidth}%` }}
                                      />
                                    </span>
                                    <span className={`w-8 text-right text-xs tabular-nums ${conceptTone.text}`}>
                                      {concept.avgScore.toFixed(1)}
                                    </span>
                                  </li>
                                );
                              })
                            )}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )}
      </PageFrame>
    </div>
  );
}

function PracticeStat({ label, value }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-4xl font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}

function ScoreDial({ score, interviews }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const clamped = score == null ? 0 : Math.max(0, Math.min(100, score));
  const offset = circumference - (clamped / 100) * circumference;
  const tone = masteryMeta(score != null ? score / 10 : null);

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-40 w-40">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
          <circle cx="70" cy="70" r={radius} fill="none" stroke="rgba(148,163,184,0.16)" strokeWidth="8" />
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="#5eead4"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-5xl font-semibold tabular-nums text-white">{score != null ? score : "—"}</p>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">Avg / 100</p>
        </div>
      </div>
      <p className={`mt-3 text-sm ${TONE[tone.tone].text}`}>{interviews === 0 ? "No interviews yet" : tone.label}</p>
    </div>
  );
}

function Insight({ label, topic, score, tone }) {
  const colors = TONE[tone] || TONE.muted;
  return (
    <div className="min-w-0 flex-1">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 truncate text-base font-semibold text-white">{topic}</p>
      <p className={`text-xs ${colors.text}`}>{score.toFixed(1)}/10 average</p>
    </div>
  );
}

function ScoreChart({ trend, chart, hoveredPoint, setHoveredPoint }) {
  return (
    <div className="relative pt-3">
      {hoveredPoint && (
        <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 rounded-lg border border-white/10 bg-slate-950/90 px-2.5 py-1 text-xs text-slate-200">
          {hoveredPoint.avgScore}/100 ·{" "}
          {new Date(`${hoveredPoint.date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </div>
      )}
      <svg viewBox="0 0 640 160" className="h-40 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="detailArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="detailStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#2dd4bf" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>
        </defs>
        <path d={chart.area} fill="url(#detailArea)" />
        <path d={chart.line} fill="none" stroke="url(#detailStroke)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {chart.dots.map((dot) => (
          <g key={dot.date} onMouseEnter={() => setHoveredPoint(dot)} onMouseLeave={() => setHoveredPoint(null)}>
            <circle cx={dot.x} cy={dot.y} r="12" fill="transparent" className="cursor-pointer" />
            <circle cx={dot.x} cy={dot.y} r="4" fill="#0b1020" stroke="#2dd4bf" strokeWidth="2" />
          </g>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>{new Date(`${trend[0].date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
        <span>
          {new Date(`${trend[trend.length - 1].date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
      </div>
    </div>
  );
}
