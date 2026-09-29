import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listInterviews } from "../lib/api.js";
import InterviewCard from "../components/InterviewCard.jsx";
import PageFrame from "../components/layout/PageFrame.jsx";

export default function Dashboard() {
  const [interviews, setInterviews] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    listInterviews()
      .then(({ interviews: data }) => setInterviews(data))
      .catch((err) => setError(err.message || "Could not load your interviews."));
  }, []);

  return (
    <PageFrame>
      <div className="w-full">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-white">Your interviews</h1>
            <p className="mt-1 text-sm text-slate-400">Pick up an interview you set up, or start a new one.</p>
          </div>
          <Link
            to="/interviews/create"
            className="inline-flex shrink-0 items-center whitespace-nowrap rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400"
          >
            + New interview
          </Link>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {interviews === null && !error && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center text-sm text-slate-400">
            Loading your interviews...
          </div>
        )}

        {interviews && interviews.length === 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center text-sm text-slate-400">
            You haven't set up any interviews yet. Click "New interview" to get started.
          </div>
        )}

        {interviews && interviews.length > 0 && (
          <div className="grid items-stretch gap-4 sm:grid-cols-2">
            {interviews.map((interview) => (
              <InterviewCard key={interview.id} interview={interview} />
            ))}
          </div>
        )}
      </div>
    </PageFrame>
  );
}
