import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Briefcase, ClipboardList, Percent, Sparkles } from "lucide-react";
import { getDashboard } from "../lib/api.js";

const RANGES = [
  { id: "this_week", label: "This week" },
  { id: "last_week", label: "Last week" },
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "all", label: "All time" },
];

const JOB_STATUSES = [
  { key: "applied", label: "Applied", text: "text-sky-300", color: "#38bdf8" },
  { key: "interviewed", label: "Interviewed", text: "text-amber-300", color: "#fbbf24" },
  { key: "offered", label: "Offered", text: "text-emerald-300", color: "#34d399" },
  { key: "rejected", label: "Rejected", text: "text-rose-300", color: "#fb7185" },
];

const JOB_STATUS_BADGE = {
  applied: "bg-sky-500/15 text-sky-300",
  interviewed: "bg-amber-500/15 text-amber-300",
  offered: "bg-emerald-500/15 text-emerald-300",
  rejected: "bg-rose-500/15 text-rose-300",
};

function masteryMeta(avgScore) {
  if (avgScore == null) return { label: "No scores yet", tone: "muted" };
  if (avgScore >= 8) return { label: "Strong", tone: "strong" };
  if (avgScore >= 6) return { label: "Solid", tone: "solid" };
  if (avgScore >= 4) return { label: "Developing", tone: "developing" };
  return { label: "Needs work", tone: "weak" };
}

const TONE = {
  strong: { text: "text-teal-300", bar: "from-teal-300 to-cyan-400", ring: "#2dd4bf" },
  solid: { text: "text-sky-300", bar: "from-sky-300 to-indigo-400", ring: "#38bdf8" },
  developing: { text: "text-amber-300", bar: "from-amber-300 to-orange-400", ring: "#fbbf24" },
  weak: { text: "text-rose-300", bar: "from-rose-400 to-pink-400", ring: "#fb7185" },
  muted: { text: "text-slate-400", bar: "from-slate-500 to-slate-400", ring: "#64748b" },
};

function formatRangeLabel(start, end, range) {
  if (range === "all" || (!start && !end)) return "All time";
  const opts = { month: "short", day: "numeric" };
  const a = start ? new Date(start).toLocaleDateString(undefined, opts) : "…";
  const b = end ? new Date(end).toLocaleDateString(undefined, opts) : "now";
  return `${a} – ${b}`;
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatRate(value) {
  return value == null ? "—" : `${value}%`;
}

function jobLabel(company, role) {
  const name = company?.trim() || "Unknown company";
  const title = role?.trim() || "Role not set";
  return { name, title };
}

function donutArcs(byStatus, total) {
  const r = 54;
  const circumference = 2 * Math.PI * r;
  const gap = total > 0 ? 4 : 0;
  let cursor = 0;
  const arcs = JOB_STATUSES.map((status) => {
    const value = byStatus?.[status.key] || 0;
    const raw = total ? (value / total) * circumference : 0;
    const len = value > 0 ? Math.max(0, raw - gap) : 0;
    const arc = { ...status, value, len, start: cursor };
    cursor += raw;
    return arc;
  }).filter((arc) => arc.value > 0);
  return { r, circumference, arcs };
}

export default function Progress() {
  const navigate = useNavigate();
  const [range, setRange] = useState("this_week");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getDashboard(range)
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Could not load your dashboard.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const summary = data?.summary;
  const jobs = data?.jobs;
  const attention = data?.attention;
  const avg = summary?.avgOverallScore;

  return (
    <div className="min-h-full bg-slate-950">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-white">Overview</h1>
            {data && <p className="text-xs text-slate-500">{formatRangeLabel(data.rangeStart, data.rangeEnd, data.range)}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap rounded-xl border border-white/10 bg-white/[0.03] p-1">
              {RANGES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setRange(item.id)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                    range === item.id ? "bg-white text-slate-900" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => navigate("/applied-jobs")}
              className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.06]"
            >
              Applied jobs
            </button>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="rounded-xl bg-teal-400 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-teal-300"
            >
              Practice
            </button>
          </div>
        </header>

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
        )}

        {loading && <LoadingSkeleton />}

        {!loading && data && jobs && summary && (
          <div key={range} className="space-y-5">
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi icon={Briefcase} label="Applications" value={jobs.total} hint="Saved jobs" />
              <Kpi
                icon={ClipboardList}
                label="Saved this period"
                value={jobs.jobsSaved}
                hint={RANGES.find((item) => item.id === range)?.label || ""}
              />
              <Kpi
                icon={Percent}
                label="Offer rate"
                value={formatRate(jobs.offerRate)}
                hint={`Rejection rate ${formatRate(jobs.rejectionRate)}`}
                hintClass="text-rose-300"
              />
              <Kpi
                icon={Sparkles}
                label="Practiced"
                value={jobs.practice.jobsWithPractice}
                hint={jobs.total ? `of ${jobs.total} saved jobs` : "No saved jobs"}
                hintClass="text-teal-300"
              />
            </section>

            {attention && (
              <AttentionChips attention={attention} onOpenJobs={() => navigate("/applied-jobs")} onOpenInterviews={() => navigate("/dashboard")} />
            )}

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-white">Application stages</h2>
                <button
                  type="button"
                  onClick={() => navigate("/applied-jobs")}
                  className="text-xs font-medium text-teal-300 hover:text-teal-200"
                >
                  View jobs
                </button>
              </div>
              <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-center">
                <StatusDonut byStatus={jobs.byStatus} total={jobs.total} />
                <div className="grid w-full flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
                  {JOB_STATUSES.map((status) => (
                    <div key={status.key} className="rounded-xl bg-slate-900/70 px-3 py-3">
                      <p className={`flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide ${status.text}`}>
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: status.color }} />
                        {status.label}
                      </p>
                      <p className="mt-2 text-2xl font-semibold tabular-nums text-white">{jobs.byStatus[status.key] || 0}</p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {jobs.total ? `${Math.round(((jobs.byStatus[status.key] || 0) / jobs.total) * 100)}%` : "—"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <p className="mt-4 text-xs text-slate-500">
                {jobs.total === 0
                  ? "No saved applications yet."
                  : `${jobs.practice.jobsWithPractice} of ${jobs.practice.total} saved ${
                      jobs.practice.total === 1 ? "job has" : "jobs have"
                    } a practice interview${
                      jobs.practice.avgPracticeScore != null ? ` · avg ${jobs.practice.avgPracticeScore}/100` : ""
                    }`}
              </p>
            </section>

            <section className="rounded-[1.75rem] border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.02] px-5 py-7 sm:px-8">
              <div className="mb-6 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-white">Interview practice</h2>
                <button
                  type="button"
                  onClick={() => navigate(`/interview-progress?range=${range}`)}
                  className="text-xs font-medium text-teal-300 hover:text-teal-200"
                >
                  View progress
                </button>
              </div>
              <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
                <ScoreDial score={avg} interviews={summary.interviewsCompleted} />
                <div className="grid w-full flex-1 grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
                  <PracticeStat label="Interviews" value={summary.interviewsCompleted} />
                  <PracticeStat label="Questions" value={summary.questionsAnswered} />
                  <PracticeStat label="Topics" value={summary.topicsPracticed} />
                  <PracticeStat label="Concepts" value={summary.conceptsPracticed} />
                </div>
              </div>
            </section>

            <section className="grid gap-3 lg:grid-cols-5">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] lg:col-span-3">
                <div className="flex items-center justify-between px-4 py-3 sm:px-5">
                  <h2 className="text-sm font-semibold text-white">Recent applications</h2>
                  <button
                    type="button"
                    onClick={() => navigate("/applied-jobs")}
                    className="text-xs font-medium text-teal-300 hover:text-teal-200"
                  >
                    View all
                  </button>
                </div>
                {data.recent.applications.length === 0 ? (
                  <p className="px-5 pb-6 text-sm text-slate-500">No applications yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[32rem] text-left text-sm">
                      <thead>
                        <tr className="border-t border-white/10 text-[11px] uppercase tracking-wide text-slate-500">
                          <th className="px-4 py-2 font-medium sm:px-5">Company</th>
                          <th className="px-3 py-2 font-medium">Role</th>
                          <th className="px-3 py-2 font-medium">Date</th>
                          <th className="px-4 py-2 font-medium sm:px-5">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recent.applications.map((job) => {
                          const label = jobLabel(job.company, job.role);
                          return (
                            <tr key={job.id} className="border-t border-white/5">
                              <td className="px-4 py-2.5 sm:px-5">
                                <button
                                  type="button"
                                  onClick={() => navigate("/applied-jobs")}
                                  className="max-w-[12rem] truncate text-left text-slate-100 hover:text-white"
                                >
                                  {label.name}
                                </button>
                              </td>
                              <td className="max-w-[14rem] truncate px-3 py-2.5 text-slate-400">{label.title}</td>
                              <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">{formatDate(job.createdAt)}</td>
                              <td className="px-4 py-2.5 sm:px-5">
                                <span
                                  className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${JOB_STATUS_BADGE[job.status] || "bg-slate-700/40 text-slate-300"}`}
                                >
                                  {job.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 lg:col-span-2">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white">Recent interviews</h2>
                  <button
                    type="button"
                    onClick={() => navigate("/dashboard")}
                    className="text-xs font-medium text-teal-300 hover:text-teal-200"
                  >
                    View all
                  </button>
                </div>
                {data.recent.interviews.length === 0 ? (
                  <p className="py-6 text-sm text-slate-500">No completed interviews yet.</p>
                ) : (
                  <ul className="space-y-1">
                    {data.recent.interviews.map((interview) => (
                      <li key={interview.id}>
                        <button
                          type="button"
                          onClick={() => navigate(`/results/${interview.id}`)}
                          className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-2 text-left hover:bg-white/[0.04]"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm text-slate-100">
                              {interview.jobTitle?.trim() || "Untitled interview"}
                            </span>
                            <span className="text-xs text-slate-500">{formatDate(interview.completedAt)}</span>
                          </span>
                          <span className="shrink-0 text-sm font-semibold tabular-nums text-teal-200">
                            {interview.overallScore != null ? interview.overallScore : "—"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint, hintClass = "text-slate-500" }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
      <p className="flex items-center gap-2 text-xs text-slate-400">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-white">{value}</p>
      <p className={`mt-1 truncate text-xs ${hintClass}`}>{hint}</p>
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
      <div className="relative h-36 w-36">
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
          <p className="text-4xl font-semibold tabular-nums text-white">{score != null ? score : "—"}</p>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">Avg / 100</p>
        </div>
      </div>
      <p className={`mt-3 text-sm ${TONE[tone.tone].text}`}>{interviews === 0 ? "No interviews yet" : tone.label}</p>
    </div>
  );
}

function AttentionChips({ attention, onOpenJobs, onOpenInterviews }) {
  const chips = [
    attention.unfinishedInterviews.count > 0 && {
      key: "continue",
      label: `${attention.unfinishedInterviews.count} to continue`,
      onClick: onOpenInterviews,
    },
    attention.jobsWithoutPractice.count > 0 && {
      key: "practice",
      label: `${attention.jobsWithoutPractice.count} need practice`,
      onClick: onOpenJobs,
    },
    attention.staleApplied.count > 0 && {
      key: "follow",
      label: `${attention.staleApplied.count} to follow up`,
      onClick: onOpenJobs,
    },
  ].filter(Boolean);

  if (!chips.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onClick}
          className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-300 transition hover:bg-white/[0.07] hover:text-white"
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}

function StatusDonut({ byStatus, total }) {
  const { r, circumference, arcs } = donutArcs(byStatus, total);
  return (
    <div className="relative h-40 w-40 shrink-0">
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
        <circle cx="80" cy="80" r={r} fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="14" />
        {arcs.map((arc) => (
          <circle
            key={arc.key}
            cx="80"
            cy="80"
            r={r}
            fill="none"
            stroke={arc.color}
            strokeWidth="14"
            strokeDasharray={`${arc.len} ${circumference - arc.len}`}
            strokeDashoffset={-arc.start}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-3xl font-semibold tabular-nums text-white">{total}</p>
        <p className="text-[10px] uppercase tracking-wide text-slate-500">Total</p>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="h-24 rounded-2xl bg-white/[0.04]" />
        <div className="h-24 rounded-2xl bg-white/[0.04]" />
        <div className="h-24 rounded-2xl bg-white/[0.04]" />
        <div className="h-24 rounded-2xl bg-white/[0.04]" />
      </div>
      <div className="h-56 rounded-2xl bg-white/[0.03]" />
      <div className="h-40 rounded-2xl bg-white/[0.03]" />
    </div>
  );
}
