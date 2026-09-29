import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import PageFrame from "../components/layout/PageFrame.jsx";

const TABS = [
  { id: "account", label: "Account" },
  { id: "password", label: "Password" },
];

function formatJoined(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

const inputClass =
  "w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400";

export default function AccountProfile() {
  const { user, updateAccount } = useAuth();
  const [tab, setTab] = useState("account");
  const [name, setName] = useState(user?.name || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(user?.name || "");
  }, [user?.name]);

  function switchTab(next) {
    setTab(next);
    setError("");
    setSuccess("");
  }

  async function handleAccountSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    if (trimmed.length > 80) {
      setError("Name must be 80 characters or fewer.");
      return;
    }
    if (trimmed === (user?.name || "")) {
      setSuccess("No changes to save.");
      return;
    }

    setSaving(true);
    try {
      await updateAccount({ name: trimmed });
      setSuccess("Profile updated.");
    } catch (err) {
      setError(err.message || "Could not update your profile.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!currentPassword || !newPassword) {
      setError("Enter your current password and a new password.");
      return;
    }
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    setSaving(true);
    try {
      await updateAccount({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Password updated.");
    } catch (err) {
      setError(err.message || "Could not update your password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageFrame>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Profile</h1>
        <p className="mt-1 text-sm text-slate-400">Update your name or password. Your email stays on this account.</p>
      </div>

      <div className="max-w-xl">
        <div className="mb-4 flex gap-2 rounded-xl border border-slate-800 bg-slate-900/40 p-1" role="tablist" aria-label="Profile sections">
          {TABS.map((item) => {
            const selected = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`profile-tab-${item.id}`}
                aria-selected={selected}
                aria-controls={`profile-panel-${item.id}`}
                onClick={() => switchTab(item.id)}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition ${
                  selected ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>
        )}
        {success && (
          <div className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            {success}
          </div>
        )}

        {tab === "account" && (
          <form
            id="profile-panel-account"
            role="tabpanel"
            aria-labelledby="profile-tab-account"
            onSubmit={handleAccountSubmit}
            className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6"
          >
            <div className="space-y-4">
              <div>
                <label htmlFor="account-name" className="mb-1.5 block text-xs font-medium text-slate-400">
                  Name
                </label>
                <input
                  id="account-name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={80}
                  autoComplete="name"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="account-email" className="mb-1.5 block text-xs font-medium text-slate-400">
                  Email
                </label>
                <input
                  id="account-email"
                  type="email"
                  value={user?.email || ""}
                  readOnly
                  className="w-full cursor-not-allowed rounded-lg border border-slate-800 bg-slate-950/20 px-3 py-2 text-sm text-slate-400 outline-none"
                />
                <p className="mt-1.5 text-xs text-slate-500">Email is only for display and cannot be edited.</p>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-400">Member since</p>
                <p className="rounded-lg border border-slate-800 bg-slate-950/20 px-3 py-2 text-sm text-slate-300">
                  {formatJoined(user?.createdAt)}
                </p>
              </div>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="mt-5 rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-700"
            >
              {saving ? "Saving..." : "Save profile"}
            </button>
          </form>
        )}

        {tab === "password" && (
          <form
            id="profile-panel-password"
            role="tabpanel"
            aria-labelledby="profile-tab-password"
            onSubmit={handlePasswordSubmit}
            className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6"
          >
            <div className="space-y-4">
              <div>
                <label htmlFor="current-password" className="mb-1.5 block text-xs font-medium text-slate-400">
                  Current password
                </label>
                <input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="new-password" className="mb-1.5 block text-xs font-medium text-slate-400">
                  New password
                </label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="confirm-password" className="mb-1.5 block text-xs font-medium text-slate-400">
                  Confirm new password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  className={inputClass}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="mt-5 rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-700"
            >
              {saving ? "Saving..." : "Update password"}
            </button>
          </form>
        )}
      </div>
    </PageFrame>
  );
}
