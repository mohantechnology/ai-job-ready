import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import PageFrame from "./layout/PageFrame.jsx";

export default function RequireAdmin() {
  const { user } = useAuth();

  if (user?.role !== "admin") {
    return (
      <PageFrame>
        <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-10 text-center">
          <h1 className="text-lg font-semibold text-white">Admin access denied</h1>
          <p className="mt-2 text-sm text-slate-400">This account does not have admin access.</p>
          <Link
            to="/dashboard"
            className="mt-6 inline-flex rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400"
          >
            Back to dashboard
          </Link>
        </div>
      </PageFrame>
    );
  }

  return <Outlet />;
}
