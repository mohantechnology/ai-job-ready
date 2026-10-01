import { useEffect, useState } from "react";
import { Briefcase, ClipboardList, Sparkles, UserCheck, UserPlus, Users } from "lucide-react";
import { getAdminStats } from "../lib/api.js";
import PageFrame from "../components/layout/PageFrame.jsx";

const CARDS = [
  { key: "totalUsers", label: "Total users", hint: "Accounts in the database", icon: Users },
  { key: "newUsers7d", label: "New users", hint: "Joined in the last 7 days", icon: UserPlus },
  { key: "activeUsers7d", label: "Active users", hint: "Interview or job activity, 7 days", icon: UserCheck },
  { key: "activeUsers30d", label: "Active users", hint: "Interview or job activity, 30 days", icon: UserCheck },
  { key: "interviewsStarted", label: "Interviews started", hint: "Started or finished", icon: ClipboardList },
  { key: "interviewsCompleted", label: "Interviews completed", hint: "Finished sessions", icon: Sparkles },
  { key: "appliedJobs", label: "Applied jobs", hint: "Saved across all users", icon: Briefcase },
];

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getAdminStats()
      .then((payload) => {
        if (!cancelled) setStats(payload);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Could not load admin stats.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-full">
      <PageFrame className="flex flex-col gap-5">
        <header>
          <h1 className="text-lg font-semibold text-white">Admin dashboard</h1>
          <p className="text-xs text-slate-500">How people are using JobReady</p>
        </header>

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
        )}

        {loading && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {CARDS.map((card) => (
              <div key={card.key} className="h-28 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
            ))}
          </div>
        )}

        {!loading && stats && (
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {CARDS.map(({ key, label, hint, icon: Icon }) => (
              <div key={key} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
                <p className="flex items-center gap-2 text-xs text-slate-400">
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </p>
                <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-white">{stats[key] ?? 0}</p>
                <p className="mt-1 truncate text-xs text-slate-500">{hint}</p>
              </div>
            ))}
          </section>
        )}
      </PageFrame>
    </div>
  );
}
