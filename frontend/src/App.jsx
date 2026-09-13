import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import RequireAuth from "./components/RequireAuth.jsx";
import AppLayout from "./components/layout/AppLayout.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import SetupWizard from "./pages/SetupWizard.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Progress from "./pages/Progress.jsx";
import AppliedJobs from "./pages/AppliedJobs.jsx";
import JobProfile from "./pages/JobProfile.jsx";
import MicCheck from "./pages/MicCheck.jsx";
import Interview from "./pages/Interview.jsx";
import Results from "./pages/Results.jsx";

export default function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route
            path="/"
            element={
              <RequireAuth>
                <SetupWizard />
              </RequireAuth>
            }
          />
          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/progress" element={<Progress />} />
            <Route path="/applied-jobs" element={<AppliedJobs />} />
            <Route path="/job-profile" element={<JobProfile />} />
          </Route>

          <Route
            path="/mic-check/:id"
            element={
              <RequireAuth>
                <MicCheck />
              </RequireAuth>
            }
          />
          <Route
            path="/interview/:id"
            element={
              <RequireAuth>
                <Interview />
              </RequireAuth>
            }
          />
          <Route
            path="/results/:id"
            element={
              <RequireAuth>
                <Results />
              </RequireAuth>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </AuthProvider>
  );
}
