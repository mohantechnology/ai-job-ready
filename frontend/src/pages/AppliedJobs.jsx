import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Briefcase, Building2, Calendar, MapPin, Search, Sparkles } from "lucide-react";

// Dummy application-tracking data. This page isn't wired to the backend yet -
// it exists so you can see, at a glance, everything you've applied to and
// jump straight into a tailored mock interview for any one of them.
const APPLIED_JOBS = [
  {
    id: "job-1",
    company: "Nimbus Cloud",
    role: "Frontend Developer",
    level: "Mid-level",
    location: "Bengaluru, India",
    mode: "Hybrid",
    salary: "18-24 LPA",
    appliedDate: "2026-08-20",
    status: "interviewing",
    topics: ["React", "TypeScript", "CSS"],
    notes: "Recruiter screen done. Technical round scheduled for next week.",
  },
  {
    id: "job-2",
    company: "Fintrix Labs",
    role: "Backend Developer",
    level: "Mid-level",
    location: "Remote",
    mode: "Remote",
    salary: "20-28 LPA",
    appliedDate: "2026-08-15",
    status: "applied",
    topics: ["Node.js", "SQL", "System Design"],
    notes: "Application submitted through referral. Awaiting response.",
  },
  {
    id: "job-3",
    company: "Vertex Analytics",
    role: "Data Analyst",
    level: "Junior",
    location: "Pune, India",
    mode: "Onsite",
    salary: "10-14 LPA",
    appliedDate: "2026-08-05",
    status: "offer",
    topics: ["SQL", "Python", "Communication"],
    notes: "Final offer received - reviewing before responding.",
  },
  {
    id: "job-4",
    company: "Corebit Systems",
    role: "DevOps Engineer",
    level: "Senior",
    location: "Hyderabad, India",
    mode: "Hybrid",
    salary: "26-34 LPA",
    appliedDate: "2026-07-28",
    status: "rejected",
    topics: ["System Design", "Node.js"],
    notes: "Didn't move past the technical round this time.",
  },
  {
    id: "job-5",
    company: "Solstice Health",
    role: "Full Stack Developer",
    level: "Mid-level",
    location: "Remote",
    mode: "Remote",
    salary: "22-30 LPA",
    appliedDate: "2026-09-02",
    status: "applied",
    topics: ["React", "Node.js", "SQL"],
    notes: "Applied via company careers page.",
  },
  {
    id: "job-6",
    company: "Lumen Retail",
    role: "Product Manager",
    level: "Mid-level",
    location: "Mumbai, India",
    mode: "Onsite",
    salary: "24-32 LPA",
    appliedDate: "2026-08-29",
    status: "interviewing",
    topics: ["Communication", "System Design"],
    notes: "Cleared the first panel round, waiting on the next steps.",
  },
];

const STATUS_META = {
  applied: { label: "Applied", classes: "bg-sky-500/15 text-sky-300" },
  interviewing: { label: "Interviewing", classes: "bg-amber-500/15 text-amber-300" },
  offer: { label: "Offer", classes: "bg-emerald-500/15 text-emerald-300" },
  rejected: { label: "Rejected", classes: "bg-red-500/15 text-red-300" },
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "applied", label: "Applied" },
  { id: "interviewing", label: "Interviewing" },
  { id: "offer", label: "Offer" },
  { id: "rejected", label: "Rejected" },
];

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" });
}

function companyInitials(name) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const AVATAR_THEMES = [
  "from-indigo-500 to-violet-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-sky-500 to-indigo-500",
  "from-rose-500 to-pink-500",
  "from-teal-500 to-cyan-500",
];

export default function AppliedJobs() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const base = { all: APPLIED_JOBS.length, applied: 0, interviewing: 0, offer: 0, rejected: 0 };
    for (const job of APPLIED_JOBS) base[job.status] += 1;
    return base;
  }, []);

  const filteredJobs = useMemo(() => {
    return APPLIED_JOBS.filter((job) => {
      const matchesFilter = filter === "all" || job.status === filter;
      const q = query.trim().toLowerCase();
      const matchesQuery =
        !q ||
        job.role.toLowerCase().includes(q) ||
        job.company.toLowerCase().includes(q) ||
        job.topics.some((t) => t.toLowerCase().includes(q));
      return matchesFilter && matchesQuery;
    });
  }, [filter, query]);

  function handleStartInterview(job) {
    navigate("/", {
      state: {
        prefillJobTitle: job.role,
        prefillTopics: job.topics,
        prefillCompany: job.company,
      },
    });
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-8">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Applied jobs</h1>
          <p className="mt-1 text-sm text-slate-400">
            Track every application in one place, and turn any of them into a tailored mock interview.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Applied" value={counts.applied} tone="sky" />
        <StatCard label="Interviewing" value={counts.interviewing} tone="amber" />
        <StatCard label="Offers" value={counts.offer} tone="emerald" />
        <StatCard label="Rejected" value={counts.rejected} tone="red" />
      </div>

      {/* Search + filters */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by role, company, or skill"
            className="w-full rounded-xl border border-slate-800 bg-slate-900/40 py-2.5 pl-9 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-indigo-400"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                  active
                    ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/25"
                    : "border border-slate-800 text-slate-400 hover:border-indigo-400/50 hover:text-indigo-300"
                }`}
              >
                {f.label}
                <span className={`ml-1.5 ${active ? "text-indigo-100" : "text-slate-600"}`}>{counts[f.id]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Job list */}
      {filteredJobs.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-10 text-center text-sm text-slate-400">
          No applications match your search.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filteredJobs.map((job, index) => {
            const status = STATUS_META[job.status];
            const avatarTheme = AVATAR_THEMES[index % AVATAR_THEMES.length];
            return (
              <div
                key={job.id}
                className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg shadow-black/20 transition hover:border-indigo-400/40 hover:bg-slate-900"
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
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${status.classes}`}>
                    {status.label}
                  </span>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    {job.location} &middot; {job.mode}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Applied {formatDate(job.appliedDate)}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {job.topics.map((topic) => (
                    <span key={topic} className="rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-300">
                      {topic}
                    </span>
                  ))}
                </div>

                <p className="line-clamp-2 text-xs text-slate-500">{job.notes}</p>

                <div className="mt-1 flex items-center justify-between gap-3 border-t border-slate-800/80 pt-4">
                  <span className="text-xs font-medium text-slate-500">{job.salary}</span>
                  <button
                    type="button"
                    onClick={() => handleStartInterview(job)}
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3.5 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Practice for this role
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
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
