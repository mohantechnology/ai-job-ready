import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Briefcase, ClipboardList, Percent, Sparkles } from "lucide-react";
import { downloadAdminUserUsageCsv, getAdminUser, getAdminUserUsage } from "../lib/api.js";
import PageFrame from "../components/layout/PageFrame.jsx";
import UsagePanel from "../components/usage/UsagePanel.jsx";

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

const INTERVIEW_STATUS = {
  created: "Not started",
  in_progress: "In progress",
  completed: "Completed",
};

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function scoreLabel(value) {
  return value == null ? "—" : String(value);
}

export default function AdminUserDetails() {
  const { userId } = useParams();
  const [details, setDetails] = useState(null);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadUsage = useCallback(
    (selection, page) => getAdminUserUsage(userId, selection, page),
    [userId]
  );
  const exportUsage = useCallback(
    (selection) => downloadAdminUserUsageCsv(userId, selection),
    [userId]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setMissing(false);
    setDetails(null);
    getAdminUser(userId)
      .then((payload) => {
        if (!cancelled) setDetails(payload);
      })
      .catch((err) => {
        if (cancelled) return;
        if (/not found/i.test(err.message || "")) setMissing(true);
        else setError(err.message || "Could not load this user.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const account = details?.user;
  const jobs = details?.jobs;
  const interviews = details?.interviews;
  const profile = details?.profile;
  const unfinished = interviews?.unfinished;

  return (
    <div className="min-h-full">
      <PageFrame className="flex flex-col gap-5">
        <Link to="/admin/users" className="inline-flex w-fit items-center gap-1.5 text-xs text-slate-400 transition hover:text-slate-200">
          <ArrowLeft className="h-3.5 w-3.5" />
          Users
        </Link>

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
        )}

        {loading && <div className="h-40 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />}

        {missing && (
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-8">
            <h1 className="text-lg font-semibold text-white">User not found</h1>
            <p className="mt-1 text-sm text-slate-400">This account is not in the database.</p>
          </section>
        )}

        {!loading && account && jobs && interviews && (
          <>
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-lg font-semibold text-white">{account.name}</h1>
                  <p className="mt-1 truncate text-sm text-slate-400">{account.email}</p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    account.isAdmin ? "bg-amber-500/15 text-amber-200" : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {account.isAdmin ? "Admin" : "User"}
                </span>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Fact label="Joined" value={formatDate(account.createdAt)} />
                <Fact label="Last login" value={formatDateTime(account.lastLoginAt)} />
                <Fact label="Last activity" value={formatDateTime(account.lastActivityAt)} />
                <Fact label="Account updated" value={formatDateTime(account.updatedAt)} />
              </dl>
            </section>

            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat icon={Briefcase} label="Applied jobs" value={jobs.total} hint="Saved applications" />
              <Stat
                icon={ClipboardList}
                label="Interviews"
                value={interviews.total}
                hint={`${interviews.inProgress} in progress · ${interviews.completed} completed`}
              />
              <Stat icon={Percent} label="Average score" value={scoreLabel(interviews.avgOverallScore)} hint={`${interviews.questionsAnswered} questions scored`} />
              <Stat
                icon={Sparkles}
                label="Practiced jobs"
                value={jobs.practice.jobsWithPractice}
                hint={
                  jobs.practice.avgPracticeScore != null
                    ? `of ${jobs.practice.total} · avg ${jobs.practice.avgPracticeScore}/100`
                    : `of ${jobs.practice.total} saved jobs`
                }
              />
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-white">Application stages</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {JOB_STATUSES.map((status) => (
                  <div key={status.key} className="rounded-xl bg-slate-900/70 px-3 py-3">
                    <p className={`flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide ${status.text}`}>
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: status.color }} />
                      {status.label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums text-white">{jobs.byStatus[status.key] || 0}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-slate-500">
                {interviews.topicsPracticed} topics and {interviews.conceptsPracticed} concepts practiced.{" "}
                {unfinished?.count || 0} unfinished {unfinished?.count === 1 ? "interview" : "interviews"}.
              </p>
            </section>

            <div className="grid gap-5 lg:grid-cols-2">
              <ActivityList
                title="Recent applications"
                empty="No saved applications yet."
                items={details.recent.applications}
                renderItem={(job) => (
                  <li key={job.id} className="flex items-start justify-between gap-3 border-t border-white/5 px-4 py-3 first:border-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-100">{job.company || "Unknown company"}</p>
                      <p className="truncate text-xs text-slate-500">{job.role || "Role not set"}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${JOB_STATUS_BADGE[job.status] || JOB_STATUS_BADGE.applied}`}>
                        {job.status}
                      </span>
                      <p className="mt-1 text-[11px] text-slate-500">{formatDate(job.createdAt)}</p>
                    </div>
                  </li>
                )}
              />

              <ActivityList
                title="Recent interviews"
                empty="No completed interviews yet."
                items={details.recent.interviews}
                renderItem={(interview) => (
                  <li key={interview.id} className="flex items-start justify-between gap-3 border-t border-white/5 px-4 py-3 first:border-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-100">{interview.jobTitle || "Untitled interview"}</p>
                      <p className="text-xs text-slate-500">{formatDate(interview.completedAt)}</p>
                    </div>
                    <p className="shrink-0 text-sm tabular-nums text-slate-200">{scoreLabel(interview.overallScore)}</p>
                  </li>
                )}
              />
            </div>

            {unfinished?.items?.length > 0 && (
              <ActivityList
                title="Unfinished interviews"
                items={unfinished.items}
                renderItem={(interview) => (
                  <li key={interview.id} className="flex items-start justify-between gap-3 border-t border-white/5 px-4 py-3 first:border-0">
                    <p className="min-w-0 truncate text-sm text-slate-100">{interview.jobTitle || "Untitled interview"}</p>
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-slate-300">{INTERVIEW_STATUS[interview.status] || interview.status}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{formatDate(interview.createdAt)}</p>
                    </div>
                  </li>
                )}
              />
            )}

            {profile && (
              <section className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold text-white">Job profile</h2>
                  <p className="text-xs text-slate-500">Updated {formatDateTime(profile.updatedAt)}</p>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <Fact label="Current title" value={profile.currentTitle || "—"} />
                  <Fact label="Location" value={profile.location || "—"} />
                  <Fact label="Experience" value={profile.yearsOfExperience || "—"} />
                  <Fact label="Skills" value={profile.skills?.length ? profile.skills.join(", ") : "—"} wrap />
                </dl>
              </section>
            )}

            <UsagePanel
              embedded
              title="Usage"
              caption="Token use for this account"
              chartTitle="Token usage"
              loadUsage={loadUsage}
              exportUsage={exportUsage}
              showApiKeyProvider
            />
          </>
        )}
      </PageFrame>
    </div>
  );
}

function Fact({ label, value, wrap = false }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-1 text-sm text-slate-200 ${wrap ? "" : "truncate"}`} title={value}>
        {value}
      </dd>
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
      <p className="flex items-center gap-2 text-xs text-slate-400">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-white">{value}</p>
      <p className="mt-1 truncate text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function ActivityList({ title, empty, items, renderItem }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      <h2 className="px-4 py-3 text-sm font-semibold text-white">{title}</h2>
      {items.length === 0 ? (
        <p className="border-t border-white/5 px-4 py-6 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul>{items.map(renderItem)}</ul>
      )}
    </section>
  );
}
