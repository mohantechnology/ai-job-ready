import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  Briefcase,
  ClipboardList,
  Gauge,
  Pencil,
  Percent,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";
import { deleteAdminUser, downloadAdminUserUsageCsv, getAdminUser, getAdminUserUsage, updateAdminUser } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import PageFrame from "../components/layout/PageFrame.jsx";
import Modal from "../components/Modal.jsx";
import UsagePanel from "../components/usage/UsagePanel.jsx";

const JOB_STATUSES = [
  { key: "applied", label: "Applied", text: "text-sky-300", color: "#38bdf8" },
  { key: "interviewed", label: "Interviewed", text: "text-amber-300", color: "#fbbf24" },
  { key: "offered", label: "Offered", text: "text-emerald-300", color: "#34d399" },
  { key: "rejected", label: "Rejected", text: "text-rose-300", color: "#fb7185" },
];

const sectionClass =
  "rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.02] p-5 shadow-xl shadow-black/20 sm:p-6";

const inputClass =
  "w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400 disabled:cursor-not-allowed disabled:text-slate-500";

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

function initials(name, email) {
  const source = (name || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export default function AdminUserDetails() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user: currentUser, refreshUser } = useAuth();
  const [details, setDetails] = useState(null);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Edit user (Section 1)
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [confirmEdit, setConfirmEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete user (Section 1, next to Edit) — deletes the complete account
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [savingDelete, setSavingDelete] = useState(false);

  // Lazy usage (Section 4)
  const usageSentinelRef = useRef(null);
  const [usageVisible, setUsageVisible] = useState(false);

  const loadDetails = useCallback(async () => {
    const payload = await getAdminUser(userId);
    setDetails(payload);
    return payload;
  }, [userId]);

  const loadUsage = useCallback((selection, page) => getAdminUserUsage(userId, selection, page), [userId]);
  const exportUsage = useCallback((selection) => downloadAdminUserUsageCsv(userId, selection), [userId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setMissing(false);
    setDetails(null);
    setUsageVisible(false);
    setEditing(false);
    setConfirmingDelete(false);
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

  // Only mount UsagePanel (which fetches on mount) once the placeholder
  // scrolls near the viewport, and only after the rest of the page loaded.
  useEffect(() => {
    if (!details || usageVisible) return;
    const node = usageSentinelRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setUsageVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setUsageVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [details, usageVisible]);

  const account = details?.user;
  const jobs = details?.jobs;
  const interviews = details?.interviews;
  const profile = details?.profile;
  const isSelf = Boolean(account && currentUser?.id === account.id);

  function openEdit() {
    if (!account) return;
    setName(account.name || "");
    setEmail(account.email || "");
    setConfirmEdit(false);
    setEditError("");
    setEditing(true);
  }

  function closeEdit() {
    if (savingEdit) return;
    setEditing(false);
    setConfirmEdit(false);
    setEditError("");
  }

  function reviewEdit(event) {
    event.preventDefault();
    setEditError("");
    const trimmed = name.trim();
    const nextEmail = email.trim().toLowerCase();
    if (!trimmed) {
      setEditError("Name is required.");
      return;
    }
    if (trimmed.length > 80) {
      setEditError("Name must be 80 characters or fewer.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setEditError("A valid email is required.");
      return;
    }
    if (trimmed === account.name && nextEmail === account.email) {
      setEditError("No changes to save.");
      return;
    }
    setName(trimmed);
    setEmail(nextEmail);
    setConfirmEdit(true);
  }

  async function saveEdit() {
    setSavingEdit(true);
    setEditError("");
    try {
      await updateAdminUser(account.id, { name, email });
      await loadDetails();
      if (isSelf) {
        await refreshUser();
      }
      setEditing(false);
      setConfirmEdit(false);
    } catch (err) {
      setEditError(err.message || "Could not update this user.");
      setConfirmEdit(false);
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmDelete() {
    setSavingDelete(true);
    setDeleteError("");
    try {
      await deleteAdminUser(account.id);
      navigate("/admin/users", { replace: true });
    } catch (err) {
      setDeleteError(err.message || "Could not delete this user.");
      setSavingDelete(false);
    }
  }

  return (
    <div className="min-h-full">
      <PageFrame className="flex flex-col gap-6">
        <Link
          to="/admin/users"
          className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to users
        </Link>

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
        )}

        {loading && (
          <div className="flex flex-col gap-6" aria-label="Loading user details">
            <div className="h-44 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
            <div className="h-36 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
            <div className="h-56 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
            <div className="h-32 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
          </div>
        )}

        {missing && (
          <section className={sectionClass}>
            <h1 className="text-lg font-semibold text-white">User not found</h1>
            <p className="mt-1 text-sm text-slate-400">This account is not in the database.</p>
          </section>
        )}

        {!loading && account && jobs && interviews && (
          <>
            {/* 1 — User details */}
            <section className={sectionClass}>
              <SectionHeader
                icon={UserRound}
                iconClass="bg-indigo-500/15 text-indigo-300"
                title="User details"
                subtitle="Account information for this user"
                action={
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={openEdit}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-500 px-3.5 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError("");
                        setConfirmingDelete(true);
                      }}
                      disabled={isSelf}
                      title={isSelf ? "You can't delete your own account" : "Delete this account"}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-rose-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                }
              />

              <div className="mt-6 flex flex-wrap items-center gap-4">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-base font-semibold text-white shadow-lg shadow-indigo-500/25">
                  {initials(account.name, account.email)}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="truncate text-xl font-semibold tracking-tight text-white">{account.name}</h1>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                        account.isAdmin ? "bg-amber-500/15 text-amber-200" : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {account.isAdmin ? "Admin" : "User"}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm text-slate-400">{account.email}</p>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-slate-600" title={account.id}>
                    ID {account.id}
                  </p>
                </div>
              </div>

              <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Fact label="Joined" value={formatDate(account.createdAt)} />
                <Fact label="Last login" value={formatDateTime(account.lastLoginAt)} />
                <Fact label="Last activity" value={formatDateTime(account.lastActivityAt)} />
                <Fact label="Account updated" value={formatDateTime(account.updatedAt)} />
              </dl>
            </section>

            {/* 2 — Job profile */}
            <section className={sectionClass}>
              <SectionHeader
                icon={Briefcase}
                iconClass="bg-violet-500/15 text-violet-300"
                title="Job profile"
                subtitle={profile ? `Updated ${formatDateTime(profile.updatedAt)}` : "Saved candidate profile"}
              />

              {profile ? (
                <>
                  <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Fact label="Current title" value={profile.currentTitle || "—"} />
                    <Fact label="Location" value={profile.location || "—"} />
                    <Fact label="Experience" value={profile.yearsOfExperience || "—"} />
                  </dl>
                  <div className="mt-3 rounded-xl bg-slate-900/70 px-4 py-3.5">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Skills</p>
                    {profile.skills?.length ? (
                      <ul className="mt-2.5 flex flex-wrap gap-1.5">
                        {profile.skills.map((skill) => (
                          <li
                            key={skill}
                            className="rounded-full border border-indigo-400/20 bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-200"
                          >
                            {skill}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1.5 text-sm text-slate-400">—</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="mt-6 rounded-xl border border-dashed border-white/10 bg-slate-900/40 px-4 py-8 text-center">
                  <p className="text-sm text-slate-400">No job profile yet.</p>
                  <p className="mt-1 text-xs text-slate-500">This user hasn&apos;t saved any profile details.</p>
                </div>
              )}
            </section>

            {/* 3 — Activity */}
            <section className={sectionClass}>
              <SectionHeader
                icon={Activity}
                iconClass="bg-emerald-500/15 text-emerald-300"
                title="Activity"
                subtitle="Jobs, interviews, and practice at a glance"
              />

              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat icon={Briefcase} iconClass="bg-sky-500/15 text-sky-300" label="Applied jobs" value={jobs.total} hint="Saved applications" />
                <Stat
                  icon={ClipboardList}
                  iconClass="bg-amber-500/15 text-amber-300"
                  label="Interviews"
                  value={interviews.total}
                  hint={`${interviews.inProgress} in progress · ${interviews.completed} completed`}
                />
                <Stat
                  icon={Sparkles}
                  iconClass="bg-violet-500/15 text-violet-300"
                  label="Practiced jobs"
                  value={jobs.practice.jobsWithPractice}
                  hint={
                    jobs.practice.avgPracticeScore != null
                      ? `of ${jobs.practice.total} · avg ${jobs.practice.avgPracticeScore}/100`
                      : `of ${jobs.practice.total} saved jobs`
                  }
                />
                <Stat
                  icon={Percent}
                  iconClass="bg-emerald-500/15 text-emerald-300"
                  label="Average score"
                  value={scoreLabel(interviews.avgOverallScore)}
                  hint={`${interviews.questionsAnswered} questions scored`}
                />
              </div>

              <h3 className="mt-7 text-xs font-semibold uppercase tracking-wider text-slate-400">Application stages</h3>
              <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
                {JOB_STATUSES.map((status) => (
                  <div key={status.key} className="rounded-xl bg-slate-900/70 px-4 py-3.5">
                    <p className={`flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider ${status.text}`}>
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: status.color }} />
                      {status.label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-white">{jobs.byStatus[status.key] || 0}</p>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-xs leading-relaxed text-slate-500">
                {interviews.topicsPracticed} topics and {interviews.conceptsPracticed} concepts practiced.{" "}
                {interviews.unfinished?.count || 0} unfinished {interviews.unfinished?.count === 1 ? "interview" : "interviews"}.
              </p>
            </section>

            {/* 4 — Usage (lazy: mounts only when scrolled into view) */}
            {usageVisible ? (
              <UsagePanel
                embedded
                title="Usage"
                caption="Token use for this account"
                chartTitle="Token usage"
                loadUsage={loadUsage}
                exportUsage={exportUsage}
                showApiKeyProvider
              />
            ) : (
              <section ref={usageSentinelRef} className={sectionClass}>
                <SectionHeader
                  icon={Gauge}
                  iconClass="bg-teal-500/15 text-teal-300"
                  title="Usage"
                  subtitle="Token use for this account"
                />
                <div className="mt-6 flex flex-col items-center rounded-xl border border-dashed border-white/10 bg-slate-900/40 px-4 py-10 text-center">
                  <div className="h-8 w-8 animate-pulse rounded-full bg-white/[0.06]" />
                  <p className="mt-4 text-sm text-slate-400">Usage loads as you scroll</p>
                  <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
                    Token usage takes a moment to load, so it&apos;s fetched only once you reach this section.
                  </p>
                </div>
              </section>
            )}
          </>
        )}
      </PageFrame>

      {editing && account && (
        <Modal title={confirmEdit ? "Confirm update" : "Edit user"} onClose={closeEdit}>
          {editError && (
            <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{editError}</div>
          )}
          {confirmEdit ? (
            <div>
              <p className="text-sm leading-relaxed text-slate-300">
                Update <span className="font-medium text-white">{account.name}</span> to{" "}
                <span className="font-medium text-white">{name}</span>
                {email !== account.email ? (
                  <>
                    {" "}
                    and change the email to <span className="font-medium text-white">{email}</span>
                  </>
                ) : null}
                ?
              </p>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmEdit(false)}
                  disabled={savingEdit}
                  className="rounded-lg px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={savingEdit}
                  className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-700"
                >
                  {savingEdit ? "Saving..." : "Confirm update"}
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={reviewEdit}>
              <label className="block text-xs font-medium text-slate-400">
                Name
                <input className={`${inputClass} mt-1.5`} value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label className="mt-4 block text-xs font-medium text-slate-400">
                Email
                <input
                  className={`${inputClass} mt-1.5`}
                  type="email"
                  value={email}
                  disabled={isSelf}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              {isSelf && <p className="mt-2 text-xs text-slate-500">Your own email stays on the admin allow-list.</p>}
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeEdit}
                  className="rounded-lg px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400"
                >
                  Continue
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {confirmingDelete && account && (
        <Modal title="Delete account permanently" onClose={() => !savingDelete && setConfirmingDelete(false)}>
          {deleteError && (
            <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{deleteError}</div>
          )}
          <div className="mb-4 flex gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3">
            <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
            <p className="text-sm leading-relaxed text-rose-200">
              This will permanently delete the complete account.{" "}
              <span className="font-semibold text-white">This action cannot be reversed.</span>
            </p>
          </div>
          <p className="text-sm leading-relaxed text-slate-300">
            Delete <span className="font-medium text-white">{account.name}</span> ({account.email})? The account and
            everything linked to it — interviews, job profile, and applied jobs — will be removed permanently and
            cannot be recovered.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={savingDelete}
              className="rounded-lg px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={savingDelete}
              className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:bg-slate-700"
            >
              {savingDelete ? "Deleting..." : "Delete permanently"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SectionHeader({ icon: Icon, iconClass, title, subtitle, action }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-white">{title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

function Fact({ label, value }) {
  return (
    <div className="min-w-0 rounded-xl bg-slate-900/70 px-4 py-3.5">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-1.5 truncate text-sm font-medium text-slate-100" title={value}>
        {value}
      </dd>
    </div>
  );
}

function Stat({ icon: Icon, iconClass, label, value, hint }) {
  return (
    <div className="rounded-xl bg-slate-900/70 px-4 py-4">
      <p className="flex items-center gap-2 text-xs font-medium text-slate-400">
        <span className={`flex h-6 w-6 items-center justify-center rounded-lg ${iconClass}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-white">{value}</p>
      <p className="mt-1 truncate text-xs text-slate-500" title={hint}>
        {hint}
      </p>
    </div>
  );
}
