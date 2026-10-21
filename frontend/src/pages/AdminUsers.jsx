import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, Trash2, Users } from "lucide-react";
import { deleteAdminUser, listAdminUsers } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import PageFrame from "../components/layout/PageFrame.jsx";
import Modal from "../components/Modal.jsx";

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function userDetailsPath(id) {
  return `/admin/users/${id}/details`;
}

function initials(name, email) {
  const source = (name || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

const iconButtonClass =
  "rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400";

export default function AdminUsers() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listAdminUsers()
      .then((payload) => {
        if (!cancelled) setUsers(payload.users || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Could not load users.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function confirmDelete() {
    setSaving(true);
    setFormError("");
    try {
      await deleteAdminUser(deleting.id);
      setUsers((current) => current.filter((row) => row.id !== deleting.id));
      setDeleting(null);
    } catch (err) {
      setFormError(err.message || "Could not delete this user.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-full">
      <PageFrame className="flex flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">Users</h1>
            <p className="mt-1 text-sm text-slate-400">Every account in the database</p>
          </div>
          {!loading && !error && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-slate-300">
              <Users className="h-3.5 w-3.5 text-slate-400" />
              {users.length} {users.length === 1 ? "user" : "users"}
            </span>
          )}
        </header>

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
        )}

        {loading && <div className="h-64 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />}

        {!loading && !error && (
          <section className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.02] shadow-xl shadow-black/20">
            {users.length === 0 ? (
              <p className="px-6 py-12 text-center text-sm text-slate-500">No users yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[46rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.03] text-[11px] uppercase tracking-wider text-slate-500">
                      <th className="px-5 py-3.5 font-medium sm:px-6">Name</th>
                      <th className="px-4 py-3.5 font-medium">Email</th>
                      <th className="px-4 py-3.5 font-medium">Access</th>
                      <th className="px-4 py-3.5 text-center font-medium">Applied jobs</th>
                      <th className="px-4 py-3.5 text-center font-medium">Interviews</th>
                      <th className="px-4 py-3.5 text-center font-medium">Last activity</th>
                      <th className="px-5 py-3.5 text-right font-medium sm:px-6">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((row) => {
                      const isSelf = row.id === user?.id;
                      return (
                        <tr key={row.id} className="border-t border-white/5 transition first:border-t-0 hover:bg-white/[0.03]">
                          <td className="px-5 py-4 sm:px-6">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-semibold text-white shadow-lg shadow-indigo-500/20">
                                {initials(row.name, row.email)}
                              </span>
                              <Link
                                to={userDetailsPath(row.id)}
                                className="truncate font-medium text-slate-100 transition hover:text-indigo-200"
                              >
                                {row.name}
                              </Link>
                            </div>
                          </td>
                          <td className="max-w-[16rem] truncate px-4 py-4 text-slate-400">{row.email}</td>
                          <td className="px-4 py-4">
                            <span
                              className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                row.isAdmin ? "bg-amber-500/15 text-amber-200" : "bg-slate-800 text-slate-400"
                              }`}
                            >
                              {row.isAdmin ? "Admin" : "User"}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-center tabular-nums text-slate-200">{row.appliedJobCount ?? 0}</td>
                          <td className="px-4 py-4 text-center tabular-nums text-slate-300">{row.interviewCount}</td>
                          <td className="whitespace-nowrap px-4 py-4 text-center text-slate-500">{formatDate(row.lastActivityAt)}</td>
                          <td className="px-5 py-4 sm:px-6">
                            <div className="flex justify-end gap-1">
                              <Link to={userDetailsPath(row.id)} className={iconButtonClass} aria-label={`View ${row.name}`} title="View details">
                                <Eye className="h-4 w-4" />
                              </Link>
                              {!isSelf && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFormError("");
                                    setDeleting(row);
                                  }}
                                  className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                                  aria-label={`Delete ${row.name}`}
                                  title="Delete user"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </PageFrame>

      {deleting && (
        <Modal title="Delete user" onClose={() => !saving && setDeleting(null)}>
          {formError && (
            <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {formError}
            </div>
          )}
          <p className="text-sm leading-relaxed text-slate-300">
            Delete <span className="font-medium text-white">{deleting.name}</span> ({deleting.email})? Their interviews,
            job profile, and applied jobs are removed with the account.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleting(null)}
              disabled={saving}
              className="rounded-lg px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={saving}
              className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:bg-slate-700"
            >
              {saving ? "Deleting..." : "Confirm delete"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
