import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import RequireAuth from "./components/RequireAuth.jsx";
import RequireAdmin from "./components/RequireAdmin.jsx";
import AppLayout from "./components/layout/AppLayout.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import SetupWizard from "./pages/SetupWizard.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Progress from "./pages/Progress.jsx";
import InterviewProgress from "./pages/InterviewProgress.jsx";
import AppliedJobs from "./pages/AppliedJobs.jsx";
import JobProfile from "./pages/JobProfile.jsx";
import AccountProfile from "./pages/AccountProfile.jsx";
import MicCheck from "./pages/MicCheck.jsx";
import Interview from "./pages/Interview.jsx";
import Results from "./pages/Results.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import AdminUsers from "./pages/AdminUsers.jsx";

function SearchRedirect({ to }) {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}`} replace />;
}

function IdRedirect({ to }) {
  const { id } = useParams();
  return <Navigate to={`${to}/${id}`} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route path="/dashboard" element={<Progress />} />
            <Route path="/dashboard/interview-progress" element={<InterviewProgress />} />
            <Route path="/interviews" element={<Dashboard />} />
            <Route path="/applied-jobs" element={<AppliedJobs />} />
            <Route path="/job-profile" element={<JobProfile />} />
            <Route path="/setting/profile" element={<AccountProfile />} />
            <Route element={<RequireAdmin />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/users" element={<AdminUsers />} />
            </Route>
            <Route path="/progress" element={<Navigate to="/dashboard" replace />} />
            <Route path="/interview-progress" element={<SearchRedirect to="/dashboard/interview-progress" />} />
          </Route>

          <Route
            path="/interviews/create"
            element={
              <RequireAuth>
                <SetupWizard />
              </RequireAuth>
            }
          />
          <Route
            path="/interviews/mic-check/:id"
            element={
              <RequireAuth>
                <MicCheck />
              </RequireAuth>
            }
          />
          <Route
            path="/interviews/results/:id"
            element={
              <RequireAuth>
                <Results />
              </RequireAuth>
            }
          />
          <Route
            path="/interviews/:id"
            element={
              <RequireAuth>
                <Interview />
              </RequireAuth>
            }
          />

          <Route path="/mic-check/:id" element={<IdRedirect to="/interviews/mic-check" />} />
          <Route path="/interview/:id" element={<IdRedirect to="/interviews" />} />
          <Route path="/results/:id" element={<IdRedirect to="/interviews/results" />} />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </div>
    </AuthProvider>
  );
}
