import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listInterviews } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import InterviewCard from "../components/InterviewCard.jsx";

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [interviews, setInterviews] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    listInterviews()
      .then(({ interviews: data }) => setInterviews(data))
      .catch((err) => setError(err.message || "Could not load your interviews."));
  }, []);

  function handleCardClick(interview) {
    if (interview.status === "completed") {
      navigate(`/results/${interview.id}`);
    } else {
      navigate(`/mic-check/${interview.id}`);
    }
  }

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-10">
      <div className="w-full max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">Your interviews3</h1>
            <p className="mt-1 text-sm text-slate-400">
              {user ? `Signed in as ${user.name}. ` : ""}Pick up an interview you set up, or start a new one.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* <button
              type="button"
              onClick={() => navigate("/progress")}
              className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:border-indigo-400/50 hover:text-indigo-300"
            >
              Progress
            </button> */}
            <button
              type="button"
              onClick={() => navigate("/")}
              className="rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400"
            >
              + New interview
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:border-red-400/50 hover:text-red-300"
            >
              Log out
            </button>
          </div>
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
          <div className="grid gap-4 sm:grid-cols-2">
            {interviews.map((interview) => (
              <InterviewCard
                key={interview.id}
                interview={interview}
                onClick={() => handleCardClick(interview)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
