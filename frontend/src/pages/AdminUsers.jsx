import { useEffect, useState } from "react";
import { deleteAdminUser, listAdminUsers, updateAdminUser } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import PageFrame from "../components/layout/PageFrame.jsx";
import Modal from "../components/Modal.jsx";

const inputClass =
  "w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400 disabled:cursor-not-allowed disabled:text-slate-500";

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminUsers() {
  const { user, refreshUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [confirmEdit, setConfirmEdit] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadUsers() {
    const payload = await listAdminUsers();
    setUsers(payload.users || []);
  }

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

  function openEdit(row) {
    setEditing(row);
    setName(row.name || "");
    setEmail(row.email || "");
    setConfirmEdit(false);
    setFormError("");
  }

  function closeEdit() {
    if (saving) return;
    setEditing(null);
    setConfirmEdit(false);
    setFormError("");
  }

  function reviewEdit(event) {
    event.preventDefault();
    setFormError("");
    const trimmed = name.trim();
    const nextEmail = email.trim().toLowerCase();
    if (!trimmed) {
      setFormError("Name is required.");
      return;
    }
    if (trimmed.length > 80) {
      setFormError("Name must be 80 characters or fewer.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setFormError("A valid email is required.");
      return;
    }
    if (trimmed === editing.name && nextEmail === editing.email) {
      setFormError("No changes to save.");
      return;
    }
    setName(trimmed);
    setEmail(nextEmail);
    setConfirmEdit(true);
  }

  async function saveEdit() {
    setSaving(true);
    setFormError("");
    try {
      await updateAdminUser(editing.id, { name, email });
      await loadUsers();
      if (editing.id === user?.id) {
        await refreshUser();
      }
      setEditing(null);
      setConfirmEdit(false);
    } catch (err) {
      setFormError(err.message || "Could not update this user.");
      setConfirmEdit(false);
    } finally {
      setSaving(false);
    }
  }

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

  const editingSelf = editing?.id === user?.id;

  return (
    <div className="min-h-full">
      <PageFrame className="flex flex-col gap-5">
        <header>
          <h1 className="text-lg font-semibold text-white">Users</h1>
          <p className="text-xs text-slate-500">Every account in the database</p>
        </header>

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
        )}

        {loading && <div className="h-40 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />}

        {!loading && !error && (
          <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
            {users.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-500">No users yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[52rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3 font-medium sm:px-5">Name</th>
                      <th className="px-3 py-3 font-medium">Email</th>
                      <th className="px-3 py-3 font-medium">Access</th>
                      <th className="px-3 py-3 font-medium">Joined</th>
                      <th className="px-3 py-3 font-medium">Interviews</th>
                      <th className="px-3 py-3 font-medium">Last activity</th>
                      <th className="px-4 py-3 font-medium sm:px-5">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((row) => {
                      const isSelf = row.id === user?.id;
                      return (
                        <tr key={row.id} className="border-t border-white/5">
                          <td className="px-4 py-3 font-medium text-slate-100 sm:px-5">{row.name}</td>
                          <td className="max-w-[16rem] truncate px-3 py-3 text-slate-400">{row.email}</td>
                          <td className="px-3 py-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                row.isAdmin ? "bg-amber-500/15 text-amber-200" : "bg-slate-800 text-slate-400"
                              }`}
                            >
                              {row.isAdmin ? "Admin" : "User"}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-500">{formatDate(row.createdAt)}</td>
                          <td className="px-3 py-3 tabular-nums text-slate-300">{row.interviewCount}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-500">{formatDate(row.lastActivityAt)}</td>
                          <td className="px-4 py-3 sm:px-5">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => openEdit(row)}
                                className="rounded-lg px-2.5 py-1 text-xs font-medium text-indigo-300 transition hover:bg-indigo-500/10"
                              >
                                Edit
                              </button>
                              {!isSelf && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFormError("");
                                    setDeleting(row);
                                  }}
                                  className="rounded-lg px-2.5 py-1 text-xs font-medium text-rose-300 transition hover:bg-rose-500/10"
                                >
                                  Delete
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

      {editing && (
        <Modal title={confirmEdit ? "Confirm update" : "Edit user"} onClose={closeEdit}>
          {formError && (
            <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {formError}
            </div>
          )}
          {confirmEdit ? (
            <div>
              <p className="text-sm text-slate-300">
                Update <span className="font-medium text-white">{editing.name}</span> to{" "}
                <span className="font-medium text-white">{name}</span>
                {email !== editing.email ? (
                  <>
                    {" "}
                    and change the email to <span className="font-medium text-white">{email}</span>
                  </>
                ) : null}
                ?
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmEdit(false)}
                  disabled={saving}
                  className="rounded-lg px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={saving}
                  className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-700"
                >
                  {saving ? "Saving..." : "Confirm update"}
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
                  disabled={editingSelf}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              {editingSelf && <p className="mt-2 text-xs text-slate-500">Your own email stays on the admin allow-list.</p>}
              <div className="mt-5 flex justify-end gap-2">
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

      {deleting && (
        <Modal title="Delete user" onClose={() => !saving && setDeleting(null)}>
          {formError && (
            <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {formError}
            </div>
          )}
          <p className="text-sm text-slate-300">
            Delete <span className="font-medium text-white">{deleting.name}</span> ({deleting.email})? Their interviews,
            job profile, and applied jobs are removed with the account.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleting(null)}
              disabled={saving}
              className="rounded-lg px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
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
