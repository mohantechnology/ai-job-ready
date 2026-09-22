import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Briefcase,
  Building2,
  Calendar,
  ChevronDown,
  LayoutGrid,
  MapPin,
  Rows3,
  ScrollText,
  Search,
  Sparkles,
} from "lucide-react";
import AdditionalDetailsModal from "../components/AdditionalDetailsModal.jsx";
import Modal from "../components/Modal.jsx";
import PracticeInterviewModal from "../components/PracticeInterviewModal.jsx";
import { createPracticeInterview, listAppliedJobs, researchAppliedJob, updateAppliedJobStatus } from "../lib/api.js";

const STATUS_META = {
  applied: { label: "Applied", classes: "bg-sky-500/15 text-sky-300" },
  interviewed: { label: "Interviewed", classes: "bg-amber-500/15 text-amber-300" },
  offered: { label: "Offered", classes: "bg-emerald-500/15 text-emerald-300" },
  rejected: { label: "Rejected", classes: "bg-red-500/15 text-red-300" },
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "applied", label: "Applied" },
  { id: "interviewed", label: "Interviewed" },
  { id: "offered", label: "Offered" },
  { id: "rejected", label: "Rejected" },
];

const INTERVIEW_STATUS = {
  created: "Not started",
  in_progress: "In progress",
  completed: "Completed",
};

const LEVEL_LABELS = {
  junior: "Junior",
  mid: "Mid",
  senior: "Senior",
};

const AVATAR_THEMES = [
  "from-indigo-500 to-violet-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-sky-500 to-indigo-500",
  "from-rose-500 to-pink-500",
  "from-teal-500 to-cyan-500",
];

const LAYOUT_KEY = "appliedJobsLayout";

function readLayout() {
  try {
    return localStorage.getItem(LAYOUT_KEY) === "cards" ? "cards" : "list";
  } catch {
    return "list";
  }
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" });
}

function companyInitials(name) {
  return String(name || "?")
    .split(" ")
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function chunk(items, size) {
  const rows = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}

function jobNarrative(job) {
  const summary = String(job.summary || "").trim();
  const description = String(job.description || "").trim();
  if (!summary) return description;
  if (!description || description === summary) return summary;
  return `${summary}\n\n${description}`;
}

function savedPostingNotes(job) {
  const parts = [];
  if (job.company) parts.push(`Company: ${job.company}`);
  const where = [job.location, job.workMode].filter(Boolean).join(" · ");
  if (where) parts.push(`Location: ${where}`);
  if (job.salary) parts.push(`Salary: ${job.salary}`);
  if (job.summary) parts.push(job.summary);
  if (job.description) parts.push(job.description);
  const notes = parts.join("\n\n");
  return notes ? `Saved posting\n${notes}`.slice(0, 8000) : "";
}

export default function AppliedJobs() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [layout, setLayout] = useState(readLayout);
  const [openJobId, setOpenJobId] = useState("");
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [detailsJob, setDetailsJob] = useState(null);
  const [notesView, setNotesView] = useState(null);
  const [practiceJob, setPracticeJob] = useState(null);
  const [practiceBusy, setPracticeBusy] = useState(false);
  const [practiceError, setPracticeError] = useState("");

  useEffect(() => {
    let cancelled = false;
    listAppliedJobs()
      .then(({ jobs: data }) => {
        if (!cancelled) setJobs(data || []);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || "Could not load your applied jobs.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    const base = { all: jobs?.length || 0, applied: 0, interviewed: 0, offered: 0, rejected: 0 };
    for (const job of jobs || []) {
      if (base[job.status] != null) base[job.status] += 1;
    }
    return base;
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    return (jobs || []).filter((job) => {
      const matchesFilter = filter === "all" || job.status === filter;
      const q = query.trim().toLowerCase();
      const matchesQuery =
        !q ||
        job.role.toLowerCase().includes(q) ||
        job.company.toLowerCase().includes(q) ||
        (job.topics || []).some((topic) => topic.toLowerCase().includes(q));
      return matchesFilter && matchesQuery;
    });
  }, [jobs, filter, query]);

  function replaceJob(next) {
    setJobs((current) => (current || []).map((job) => (job.id === next.id ? { ...job, ...next, interviews: next.interviews ?? job.interviews } : job)));
  }

  function chooseLayout(next) {
    setLayout(next);
    try {
      localStorage.setItem(LAYOUT_KEY, next);
    } catch {
      // Preference is optional if storage is blocked.
    }
  }

  function toggleExpanded(jobId) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }

  async function handleStatusChange(job, status) {
    const previous = job.status;
    replaceJob({ ...job, status });
    setActionError("");
    try {
      const { job: saved } = await updateAppliedJobStatus(job.id, status);
      replaceJob(saved);
    } catch (err) {
      replaceJob({ ...job, status: previous });
      setActionError(err.message || "Could not update this job.");
    }
  }

  async function handlePracticeConfirm({ autofill, research }) {
    const job = practiceJob;
    if (!job) return;
    setPracticeBusy(true);
    setPracticeError("");
    try {
      if (!autofill) {
        let additionalInfo = savedPostingNotes(job);
        if (research) {
          const result = await researchAppliedJob(job.id);
          additionalInfo = result.additionalInfo || additionalInfo;
        }
        setPracticeJob(null);
        navigate("/", {
          state: {
            prefillJobTitle: job.role,
            prefillCompany: job.company,
            prefillRole: job.level,
            prefillTopics: job.topics || [],
            prefillType: "mix",
            prefillNumberOfQuestions: 5,
            prefillAdditionalInfo: additionalInfo,
            prefillAppliedJobId: job.id,
            prefillHasResearch: research,
          },
        });
        return;
      }

      const { interview } = await createPracticeInterview(job.id, { research });
      const nextInterview = {
        id: interview.id,
        jobTitle: interview.jobTitle,
        status: interview.status,
        typeOfInterview: interview.typeOfInterview,
        numberOfQuestions: interview.numberOfQuestions,
        overallScore: null,
        additionalInfo: interview.additionalInfo || null,
        createdAt: interview.createdAt,
      };
      setJobs((current) =>
        (current || []).map((item) =>
          item.id === job.id ? { ...item, interviews: [nextInterview, ...(item.interviews || [])] } : item
        )
      );
      setOpenJobId(job.id);
      setPracticeJob(null);
    } catch (err) {
      setPracticeError(err.message || "Could not create a practice interview.");
    } finally {
      setPracticeBusy(false);
    }
  }

  function openInterview(interview) {
    if (interview.status === "completed") {
      navigate(`/results/${interview.id}`);
      return;
    }
    navigate(`/mic-check/${interview.id}`);
  }

  function renderJob(job, index) {
    return (
      <JobCard
        key={job.id}
        job={job}
        layout={layout}
        avatarTheme={AVATAR_THEMES[index % AVATAR_THEMES.length]}
        open={openJobId === job.id}
        expanded={expandedIds.has(job.id)}
        onToggleOpen={() => setOpenJobId((current) => (current === job.id ? "" : job.id))}
        onToggleExpanded={() => toggleExpanded(job.id)}
        onStatusChange={(status) => handleStatusChange(job, status)}
        onPractice={() => {
          setPracticeError("");
          setPracticeJob(job);
        }}
        onShowDetails={() => setDetailsJob(job)}
        onShowNotes={(interview) =>
          setNotesView({
            title: `${interview.jobTitle || job.role} · additional details`,
            text: interview.additionalInfo,
          })
        }
        onOpenInterview={openInterview}
      />
    );
  }

  const rows = layout === "cards" ? chunk(filteredJobs, 2) : [];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-8">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Applied jobs</h1>
          <p className="mt-1 text-sm text-slate-400">
            Jobs you save from the extension land here. Track each one, and start a practice interview whenever you want.
          </p>
        </div>
        <div className="flex rounded-xl border border-slate-800 p-1" role="group" aria-label="Job layout">
          <button
            type="button"
            aria-pressed={layout === "list"}
            title="Single column"
            onClick={() => chooseLayout("list")}
            className={`rounded-lg p-2 transition ${
              layout === "list" ? "bg-indigo-500 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            <Rows3 className="h-4 w-4" />
            <span className="sr-only">Single column</span>
          </button>
          <button
            type="button"
            aria-pressed={layout === "cards"}
            title="Cards"
            onClick={() => chooseLayout("cards")}
            className={`rounded-lg p-2 transition ${
              layout === "cards" ? "bg-indigo-500 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
            <span className="sr-only">Cards</span>
          </button>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Applied" value={counts.applied} tone="sky" />
        <StatCard label="Interviewed" value={counts.interviewed} tone="amber" />
        <StatCard label="Offered" value={counts.offered} tone="emerald" />
        <StatCard label="Rejected" value={counts.rejected} tone="red" />
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by role, company, or skill"
            className="w-full rounded-xl border border-slate-800 bg-slate-900/40 py-2.5 pl-9 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-indigo-400"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((item) => {
            const active = filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                  active
                    ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/25"
                    : "border border-slate-800 text-slate-400 hover:border-indigo-400/50 hover:text-indigo-300"
                }`}
              >
                {item.label}
                <span className={`ml-1.5 ${active ? "text-indigo-100" : "text-slate-600"}`}>{counts[item.id]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {loadError && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{loadError}</div>
      )}
      {actionError && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{actionError}</div>
      )}

      {jobs === null && !loadError && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-10 text-center text-sm text-slate-400">
          Loading your applications...
        </div>
      )}

      {jobs && filteredJobs.length === 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-10 text-center text-sm text-slate-400">
          {jobs.length === 0
            ? "No saved jobs yet. Open a job posting and click Save job in the extension."
            : "No applications match your search."}
        </div>
      )}

      {jobs && filteredJobs.length > 0 && layout === "list" && (
        <div className="flex flex-col gap-4">{filteredJobs.map((job, index) => renderJob(job, index))}</div>
      )}

      {jobs && filteredJobs.length > 0 && layout === "cards" && (
        <div className="flex flex-col gap-4">
          {rows.map((pair) => (
            <div
              key={pair.map((job) => job.id).join("-")}
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:grid-rows-[auto_auto_minmax(0,1fr)_auto]"
            >
              {pair.map((job) => renderJob(job, filteredJobs.indexOf(job)))}
            </div>
          ))}
        </div>
      )}

      {detailsJob && <JobDetailsModal job={detailsJob} onClose={() => setDetailsJob(null)} />}
      {notesView && (
        <AdditionalDetailsModal title={notesView.title} text={notesView.text} onClose={() => setNotesView(null)} />
      )}
      {practiceJob && (
        <PracticeInterviewModal
          job={practiceJob}
          busy={practiceBusy}
          error={practiceError}
          onClose={() => {
            if (!practiceBusy) setPracticeJob(null);
          }}
          onConfirm={handlePracticeConfirm}
        />
      )}
    </div>
  );
}

function JobCard({
  job,
  layout,
  avatarTheme,
  open,
  expanded,
  onToggleOpen,
  onToggleExpanded,
  onStatusChange,
  onPractice,
  onShowDetails,
  onShowNotes,
  onOpenInterview,
}) {
  const interviews = job.interviews || [];
  const nextInterview = interviews.find((interview) => interview.status !== "completed");
  const status = STATUS_META[job.status] || STATUS_META.applied;
  const where = [job.location, job.workMode].filter(Boolean).join(" · ");
  const narrative = jobNarrative(job);
  const canExpand = narrative.length > 140;

  return (
    <article
      className={`flex min-w-0 flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg shadow-black/20 ${
        layout === "cards" ? "sm:row-span-4 sm:grid sm:grid-rows-subgrid sm:gap-4" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${avatarTheme} text-sm font-semibold text-white shadow-lg shadow-black/30`}
          >
            {companyInitials(job.company)}
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-white">{job.role}</h3>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-slate-400">
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              {job.company}
            </p>
          </div>
        </div>
        <label className="shrink-0">
          <span className="sr-only">Application status</span>
          <select
            value={job.status}
            onChange={(event) => onStatusChange(event.target.value)}
            className={`rounded-full border-0 px-2.5 py-1 text-[11px] font-medium outline-none ${status.classes}`}
          >
            {FILTERS.filter((item) => item.id !== "all").map((item) => (
              <option key={item.id} value={item.id} className="bg-slate-900 text-slate-100">
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-400">
        {where && (
          <span className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            {where}
          </span>
        )}
        <span className="flex items-center gap-1.5 capitalize">
          <Briefcase className="h-3.5 w-3.5" />
          {job.level}
        </span>
        <span className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          Saved {formatDate(job.createdAt)}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {job.topics?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {job.topics.map((topic) => (
              <span key={topic} className="rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-300">
                {topic}
              </span>
            ))}
          </div>
        )}
        {narrative && (
          <div>
            <p className={`whitespace-pre-wrap text-xs leading-5 text-slate-500 ${expanded ? "" : "line-clamp-3"}`}>{narrative}</p>
            {canExpand && (
              <button
                type="button"
                onClick={onToggleExpanded}
                className="mt-1.5 text-xs font-medium text-indigo-300 hover:text-indigo-200"
              >
                {expanded ? "See less" : "See more"}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex h-full flex-col gap-3 border-t border-slate-800/80 pt-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-slate-500">{job.salary}</span>
          <span className="flex items-center gap-3">
            <button type="button" onClick={onShowDetails} className="text-xs font-medium text-indigo-300 hover:text-indigo-200">
              All details
            </button>
            {job.sourceUrl && (
              <a href={job.sourceUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-indigo-300 hover:text-indigo-200">
                View posting
              </a>
            )}
          </span>
        </div>

        {interviews.length === 0 ? (
          <button
            type="button"
            onClick={onPractice}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-indigo-500 px-3.5 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Practice for this role
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              {nextInterview && (
                <button
                  type="button"
                  onClick={() => onOpenInterview(nextInterview)}
                  className="rounded-lg bg-indigo-500 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400"
                >
                  Take interview
                </button>
              )}
              <button
                type="button"
                onClick={onToggleOpen}
                className="flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-indigo-400/50 hover:text-white"
              >
                See interviews
                <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
              </button>
              <button
                type="button"
                onClick={onPractice}
                className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-indigo-400/50 hover:text-white"
              >
                New interview
              </button>
            </div>
            {open && (
              <div className="flex flex-col gap-1.5">
                {interviews.map((interview) => (
                  <div key={interview.id} className="flex items-center gap-2 rounded-lg bg-slate-950/50 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => onOpenInterview(interview)}
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left text-xs text-slate-300 transition hover:text-white"
                    >
                      <span>
                        {formatDate(interview.createdAt)} · {INTERVIEW_STATUS[interview.status] || interview.status}
                      </span>
                      <span className="shrink-0 font-medium text-indigo-300">
                        {interview.status === "completed" && interview.overallScore != null
                          ? `Score ${interview.overallScore}`
                          : interview.status === "completed"
                            ? "View results"
                            : "Open"}
                      </span>
                    </button>
                    {interview.additionalInfo && (
                      <button
                        type="button"
                        onClick={() => onShowNotes(interview)}
                        title="Additional details"
                        aria-label="Additional details"
                        className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                      >
                        <ScrollText className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function JobDetailsModal({ job, onClose }) {
  const where = [job.location, job.workMode].filter(Boolean).join(" · ");
  const facts = [
    ["Company", job.company],
    ["Level", LEVEL_LABELS[job.level] || job.level],
    ["Location", where],
    ["Salary", job.salary],
    ["Status", STATUS_META[job.status]?.label || job.status],
    ["Saved", formatDate(job.createdAt)],
    ["Page title", job.pageTitle && job.pageTitle !== job.role ? job.pageTitle : ""],
  ].filter(([, value]) => String(value || "").trim());

  return (
    <Modal title={job.role || "Job details"} onClose={onClose} wide>
      <p className="text-sm text-slate-400">{job.company}</p>
      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">{label}</dt>
            <dd className="mt-1 text-sm text-slate-200">{value}</dd>
          </div>
        ))}
      </dl>

      {job.topics?.length > 0 && (
        <section className="mt-5">
          <h3 className="text-sm font-semibold text-white">What they're looking for</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {job.topics.map((topic) => (
              <span key={topic} className="rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-300">
                {topic}
              </span>
            ))}
          </div>
        </section>
      )}

      {job.summary && (
        <section className="mt-5">
          <h3 className="text-sm font-semibold text-white">About this role</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{job.summary}</p>
        </section>
      )}

      <section className="mt-5">
        <h3 className="text-sm font-semibold text-white">Job description</h3>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">
          {job.description || "No job description was saved for this posting."}
        </p>
      </section>

      {job.sourceUrl && (
        <a
          href={job.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex text-sm font-medium text-indigo-300 hover:text-indigo-200"
        >
          View posting
        </a>
      )}
    </Modal>
  );
}

function StatCard({ label, value, tone }) {
  const tones = {
    sky: "text-sky-300",
    amber: "text-amber-300",
    emerald: "text-emerald-300",
    red: "text-red-300",
  };
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
        <Briefcase className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${tones[tone]}`}>{value}</p>
    </div>
  );
}
