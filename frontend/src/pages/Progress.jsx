import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ChevronDown, Sparkles } from "lucide-react";
import { getProgress } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";

const RANGES = [
  { id: "this_week", label: "This week" },
  { id: "last_week", label: "Last week" },
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "all", label: "All time" },
];

function masteryMeta(avgScore) {
  if (avgScore == null) return { label: "—", tone: "muted" };
  if (avgScore >= 8) return { label: "Strong", tone: "strong" };
  if (avgScore >= 6) return { label: "Solid", tone: "solid" };
  if (avgScore >= 4) return { label: "Developing", tone: "developing" };
  return { label: "Needs work", tone: "weak" };
}

const TONE = {
  strong: {
    text: "text-teal-300",
    soft: "bg-teal-400/15 text-teal-200",
    bar: "from-teal-300 to-cyan-400",
    ring: "#2dd4bf",
  },
  solid: {
    text: "text-sky-300",
    soft: "bg-sky-400/15 text-sky-200",
    bar: "from-sky-300 to-indigo-400",
    ring: "#38bdf8",
  },
  developing: {
    text: "text-amber-300",
    soft: "bg-amber-400/15 text-amber-200",
    bar: "from-amber-300 to-orange-400",
    ring: "#fbbf24",
  },
  weak: {
    text: "text-rose-300",
    soft: "bg-rose-400/15 text-rose-200",
    bar: "from-rose-400 to-pink-400",
    ring: "#fb7185",
  },
  muted: {
    text: "text-slate-400",
    soft: "bg-slate-700/40 text-slate-400",
    bar: "from-slate-500 to-slate-400",
    ring: "#64748b",
  },
};

function formatRangeLabel(start, end, range) {
  if (range === "all" || (!start && !end)) return "Across every completed interview";
  const opts = { month: "short", day: "numeric", year: "numeric" };
  const a = start ? new Date(start).toLocaleDateString(undefined, opts) : "…";
  const b = end ? new Date(end).toLocaleDateString(undefined, opts) : "now";
  return `${a} → ${b}`;
}

function buildChartPaths(points, width, height, padX = 8, padY = 16) {
  if (!points.length) return { line: "", area: "", dots: [] };

  const max = Math.max(100, ...points.map((p) => p.avgScore || 0));
  const min = 0;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const coords = points.map((p, i) => {
    const x = padX + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = padY + innerH - ((p.avgScore - min) / (max - min)) * innerH;
    return { x, y, ...p };
  });

  const line = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
  const area = `${line} L ${coords[coords.length - 1].x.toFixed(1)} ${(height - 4).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(height - 4).toFixed(1)} Z`;

  return { line, area, dots: coords };
}

export default function Progress() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [range, setRange] = useState("this_week");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedTopic, setExpandedTopic] = useState(null);
  const [hoveredPoint, setHoveredPoint] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getProgress(range)
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
  }, [range]);

  const conceptsByTopic = useMemo(() => {
    const map = new Map();
    for (const c of data?.concepts || []) {
      if (!map.has(c.topic)) map.set(c.topic, []);
      map.get(c.topic).push(c);
    }
    return map;
  }, [data]);

  const chart = useMemo(() => buildChartPaths(data?.scoreTrend || [], 640, 180), [data]);

  const strongest = useMemo(() => {
    const topics = data?.topics || [];
    if (!topics.length) return null;
    return [...topics].sort((a, b) => b.avgScore - a.avgScore)[0];
  }, [data]);

  const weakest = useMemo(() => {
    const topics = data?.topics || [];
    if (!topics.length) return null;
    return [...topics].sort((a, b) => a.avgScore - b.avgScore)[0];
  }, [data]);

  const summary = data?.summary;
  const avg = summary?.avgOverallScore;
  const hasActivity = summary && summary.interviewsCompleted > 0;

  return (
    <div className="progress-mesh relative min-h-full overflow-hidden">
      <div className="progress-orb pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-teal-400/10 blur-3xl" />
      <div className="progress-orb pointer-events-none absolute -right-16 top-40 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl [animation-delay:-4s]" />

      <div className="relative mx-auto flex w-full max-w-4xl flex-col px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
        {/* Top nav */}
        <header className="mb-10 flex items-center justify-end gap-4 animate-[fade-up_0.6s_cubic-bezier(0.22,1,0.36,1)_both]">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="rounded-xl bg-gradient-to-r from-teal-400 to-sky-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:brightness-110"
          >
            Practice again
          </button>
        </header>

        {/* Hero */}
        <section className="mb-12 text-center animate-[fade-up_0.7s_cubic-bezier(0.22,1,0.36,1)_0.05s_both]">
          <p className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-teal-300/80">
            <Sparkles className="h-3.5 w-3.5" />
            Learning progress
          </p>
          <h1 className="font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            {user?.name ? (
              <>
                <span className="text-white/90">{user.name.split(" ")[0]}</span>
                <span className="text-white/40">,</span>
                <br className="sm:hidden" />
                <span className="text-white/70"> your practice story</span>
              </>
            ) : (
              "Your practice story"
            )}
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-slate-400 sm:text-base">
            Scores, topics, and concepts from your mock interviews — so you can see what is sticking and what still
            needs work.
          </p>

          {/* Range selector */}
          <div className="mx-auto mt-8 inline-flex max-w-full flex-wrap justify-center gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1.5 backdrop-blur-md">
            {RANGES.map((r) => {
              const active = range === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRange(r.id)}
                  className={`rounded-xl px-3.5 py-2 text-xs font-medium transition sm:text-sm ${
                    active
                      ? "bg-white text-slate-900 shadow-[0_8px_24px_-12px_rgba(255,255,255,0.5)]"
                      : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
          {data && (
            <p className="mt-3 text-xs tracking-wide text-slate-500">{formatRangeLabel(data.rangeStart, data.rangeEnd, data.range)}</p>
          )}
        </section>

        {error && (
          <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        {loading && <LoadingSkeleton />}

        {!loading && data && (
          <div key={range} className="progress-stagger space-y-10">
            {/* Score hero dial */}
            <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] px-6 py-10 sm:px-10">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(45,212,191,0.12),transparent_60%)]" />
              <div className="relative flex flex-col items-center gap-8 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
                <ScoreDial score={avg} interviews={summary.interviewsCompleted} />

                <div className="grid w-full flex-1 grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4 lg:max-w-xl">
                  <Metric label="Interviews" value={summary.interviewsCompleted} />
                  <Metric label="Questions" value={summary.questionsAnswered} />
                  <Metric label="Topics" value={summary.topicsPracticed} />
                  <Metric label="Concepts" value={summary.conceptsPracticed} />
                </div>
              </div>

              {hasActivity && (strongest || weakest) && (
                <div className="relative mt-8 flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:gap-6">
                  {strongest && (
                    <Insight
                      label="Strongest topic"
                      value={strongest.topic}
                      detail={`${strongest.avgScore.toFixed(1)}/10 avg`}
                      tone="strong"
                    />
                  )}
                  {weakest && weakest.topic !== strongest?.topic && (
                    <Insight
                      label="Focus next"
                      value={weakest.topic}
                      detail={`${weakest.avgScore.toFixed(1)}/10 avg`}
                      tone="weak"
                    />
                  )}
                </div>
              )}
            </section>

            {/* Score trend */}
            <section>
              <SectionHeading title="Score over time" subtitle="Average overall interview score by day" />
              {data.scoreTrend.length === 0 ? (
                <EmptyPanel text="No graded interviews in this period yet." />
              ) : (
                <div className="relative rounded-[1.75rem] border border-white/10 bg-white/[0.03] px-3 pb-4 pt-6 sm:px-6">
                  {hoveredPoint && (
                    <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-lg border border-white/10 bg-slate-950/90 px-3 py-1.5 text-xs text-slate-200 backdrop-blur">
                      <span className="font-semibold text-white">{hoveredPoint.avgScore}/100</span>
                      <span className="mx-1.5 text-slate-600">·</span>
                      {new Date(hoveredPoint.date + "T12:00:00").toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                      <span className="mx-1.5 text-slate-600">·</span>
                      {hoveredPoint.interviewCount} interview{hoveredPoint.interviewCount === 1 ? "" : "s"}
                    </div>
                  )}
                  <svg viewBox="0 0 640 180" className="h-44 w-full overflow-visible sm:h-52" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="progressArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
                      </linearGradient>
                      <linearGradient id="progressStroke" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#2dd4bf" />
                        <stop offset="100%" stopColor="#38bdf8" />
                      </linearGradient>
                    </defs>
                    {[0.25, 0.5, 0.75].map((t) => (
                      <line
                        key={t}
                        x1="8"
                        x2="632"
                        y1={16 + (180 - 32) * t}
                        y2={16 + (180 - 32) * t}
                        stroke="rgba(148,163,184,0.12)"
                        strokeDasharray="4 6"
                      />
                    ))}
                    <path d={chart.area} fill="url(#progressArea)" className="progress-chart-area" />
                    <path
                      d={chart.line}
                      fill="none"
                      stroke="url(#progressStroke)"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      pathLength="1"
                      className="progress-chart-line"
                    />
                    {chart.dots.map((d) => (
                      <g key={d.date} onMouseEnter={() => setHoveredPoint(d)} onMouseLeave={() => setHoveredPoint(null)}>
                        <circle cx={d.x} cy={d.y} r="14" fill="transparent" className="cursor-pointer" />
                        <circle
                          cx={d.x}
                          cy={d.y}
                          r={hoveredPoint?.date === d.date ? 6 : 4}
                          fill="#0b1020"
                          stroke="#2dd4bf"
                          strokeWidth="2.5"
                          className="transition-all duration-200"
                        />
                      </g>
                    ))}
                  </svg>
                  <div className="mt-1 flex justify-between px-1 text-[10px] text-slate-500 sm:text-xs">
                    <span>
                      {new Date(data.scoreTrend[0].date + "T12:00:00").toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span>
                      {new Date(data.scoreTrend[data.scoreTrend.length - 1].date + "T12:00:00").toLocaleDateString(
                        undefined,
                        { month: "short", day: "numeric" }
                      )}
                    </span>
                  </div>
                </div>
              )}
            </section>

            {/* Topics */}
            <section>
              <SectionHeading
                title="Topic mastery"
                subtitle="Average question score out of 10 — expand a topic to see concepts"
              />
              {data.topics.length === 0 ? (
                <EmptyPanel text="No graded topic scores in this period." />
              ) : (
                <ul className="space-y-3">
                  {data.topics.map((topic, index) => {
                    const open = expandedTopic === topic.topic;
                    const concepts = conceptsByTopic.get(topic.topic) || [];
                    const meta = masteryMeta(topic.avgScore);
                    const tone = TONE[meta.tone];
                    const barPct = Math.max(4, Math.min(100, (topic.avgScore / 10) * 100));

                    return (
                      <li
                        key={topic.topic}
                        className="overflow-hidden rounded-[1.35rem] border border-white/10 bg-white/[0.03] transition hover:border-white/20 hover:bg-white/[0.05]"
                        style={{ animationDelay: `${0.05 + index * 0.04}s` }}
                      >
                        <button
                          type="button"
                          onClick={() => setExpandedTopic(open ? null : topic.topic)}
                          className="flex w-full items-center gap-4 px-4 py-4 text-left sm:gap-5 sm:px-5"
                        >
                          <ScoreRing score={topic.avgScore} color={tone.ring} size={56} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="truncate font-semibold text-white">{topic.topic}</h3>
                              <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone.soft}`}>
                                {meta.label}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                              {topic.timesAsked} question{topic.timesAsked === 1 ? "" : "s"}
                              <span className="mx-1.5 text-slate-700">·</span>
                              {topic.conceptsCount} concept{topic.conceptsCount === 1 ? "" : "s"}
                              <span className="mx-1.5 text-slate-700">·</span>
                              last {topic.lastScore}/10
                            </p>
                            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800/80">
                              <div
                                key={`${range}-${topic.topic}-${topic.avgScore}`}
                                className={`progress-bar-fill h-full rounded-full bg-gradient-to-r ${tone.bar}`}
                                style={{ width: `${barPct}%`, animationDelay: `${0.1 + index * 0.05}s` }}
                              />
                            </div>
                          </div>
                          <ChevronDown
                            className={`h-5 w-5 shrink-0 text-slate-500 transition duration-300 ${open ? "rotate-180 text-teal-300" : ""}`}
                          />
                        </button>

                        <div
                          className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                          }`}
                        >
                          <div className="overflow-hidden">
                            <div className="border-t border-white/10 px-4 pb-4 pt-3 sm:px-5">
                              {concepts.length === 0 ? (
                                <p className="text-xs text-slate-500">No concept-level scores for this topic.</p>
                              ) : (
                                <ul className="space-y-3 pt-1">
                                  {concepts.map((c, ci) => {
                                    const cMeta = masteryMeta(c.avgScore);
                                    const cTone = TONE[cMeta.tone];
                                    const cPct = Math.max(4, Math.min(100, (c.avgScore / 10) * 100));
                                    return (
                                      <li key={`${c.topic}:${c.concept}`} className="flex items-center gap-3">
                                        <div className="min-w-0 flex-1">
                                          <div className="mb-1.5 flex items-baseline justify-between gap-2">
                                            <span className="truncate text-sm text-slate-200">{c.concept}</span>
                                            <span className={`shrink-0 text-xs font-medium tabular-nums ${cTone.text}`}>
                                              {c.avgScore.toFixed(1)}
                                              <span className="text-slate-600">/10</span>
                                              <span className="ml-2 text-slate-600">×{c.timesAsked}</span>
                                            </span>
                                          </div>
                                          <div className="h-1 overflow-hidden rounded-full bg-slate-800/80">
                                            <div
                                              key={`${range}-${c.concept}-${open}`}
                                              className={`progress-bar-fill h-full rounded-full bg-gradient-to-r ${cTone.bar}`}
                                              style={{ width: `${cPct}%`, animationDelay: `${ci * 0.04}s` }}
                                            />
                                          </div>
                                        </div>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {!hasActivity && (
              <div className="rounded-[1.75rem] border border-dashed border-white/15 bg-white/[0.02] px-6 py-12 text-center">
                <p className="font-display text-2xl text-white/90">Nothing here yet</p>
                <p className="mx-auto mt-2 max-w-sm text-sm text-slate-400">
                  Complete an interview in this period and your scores, topics, and concepts will light up here.
                </p>
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-400 to-sky-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-110"
                >
                  Start an interview
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ScoreDial({ score, interviews }) {
  const r = 70;
  const c = 2 * Math.PI * r;
  const clamped = score == null ? 0 : Math.max(0, Math.min(100, score));
  const offset = c - (clamped / 100) * c;
  const tone = masteryMeta(score != null ? score / 10 : null);

  return (
    <div className="relative flex flex-col items-center">
      <div className="relative h-44 w-44 sm:h-52 sm:w-52">
        <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
          <circle cx="80" cy="80" r={r} fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="10" />
          <circle
            cx="80"
            cy="80"
            r={r}
            fill="none"
            stroke="url(#dialGrad)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-1000 ease-out"
            style={{ "--ring-circumference": c }}
          />
          <defs>
            <linearGradient id="dialGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#2dd4bf" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="font-display text-5xl font-semibold tabular-nums tracking-tight text-white sm:text-6xl">
            {score != null ? score : "—"}
          </p>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">avg / 100</p>
        </div>
      </div>
      <p className={`mt-3 text-sm font-medium ${TONE[tone.tone].text}`}>
        {interviews === 0 ? "No interviews yet" : masteryMeta(score != null ? score / 10 : null).label}
      </p>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="font-display mt-1 text-3xl font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}

function Insight({ label, value, detail, tone }) {
  const t = TONE[tone] || TONE.muted;
  return (
    <div className="flex-1">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 truncate text-base font-semibold text-white">{value}</p>
      <p className={`mt-0.5 text-xs ${t.text}`}>{detail}</p>
    </div>
  );
}

function SectionHeading({ title, subtitle }) {
  return (
    <div className="mb-4">
      <h2 className="font-display text-2xl font-semibold tracking-tight text-white">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}

function ScoreRing({ score, color, size = 56 }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(10, score ?? 0)) / 10;
  const offset = c - pct * c;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 44 44" className="h-full w-full -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="3.5" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums text-white">
        {score != null ? score.toFixed(1) : "—"}
      </span>
    </div>
  );
}

function EmptyPanel({ text }) {
  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.02] px-5 py-10 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="h-64 rounded-[2rem] border border-white/10 bg-white/[0.04]" />
      <div className="h-52 rounded-[1.75rem] border border-white/10 bg-white/[0.03]" />
      <div className="space-y-3">
        <div className="h-20 rounded-[1.35rem] border border-white/10 bg-white/[0.03]" />
        <div className="h-20 rounded-[1.35rem] border border-white/10 bg-white/[0.03]" />
        <div className="h-20 rounded-[1.35rem] border border-white/10 bg-white/[0.03]" />
      </div>
    </div>
  );
}
