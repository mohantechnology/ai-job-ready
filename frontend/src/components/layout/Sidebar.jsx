import { NavLink, useNavigate } from "react-router-dom";
import { Briefcase, IdCard, LayoutDashboard, LogOut, MessageSquare, Mic, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";

const NAV_ITEMS = [
  { to: "/progress", label: "Dashboard", icon: LayoutDashboard },
  { to: "/dashboard", label: "Interviews", icon: MessageSquare },
  { to: "/applied-jobs", label: "Applied Jobs", icon: Briefcase },
  { to: "/job-profile", label: "Job Profile", icon: IdCard },
];

const APP_NAME = "JobReady";

export default function Sidebar({ collapsed = false, onToggleCollapse, onNavigate, onClose }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex h-full w-full flex-col border-r border-slate-800 bg-slate-900">
      {/* Brand */}
      <div className={`flex items-center pt-6 pb-2 ${collapsed ? "justify-center px-2" : "justify-between px-5"}`}>
        <div className={`flex min-w-0 items-center gap-2.5 ${collapsed ? "justify-center" : ""}`}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 shadow-lg shadow-indigo-500/30">
            <Mic className="h-4.5 w-4.5 text-white" />
          </div>
          {!collapsed && <span className="truncate text-base font-semibold tracking-tight text-white">{APP_NAME}</span>}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className={`mt-6 flex-1 space-y-1 ${collapsed ? "px-2" : "px-3"}`}>
        {!collapsed && <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">Menu</p>}
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `group flex items-center rounded-xl text-sm font-medium transition ${
                collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"
              } ${isActive ? "bg-indigo-500/15 text-indigo-300" : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-100"}`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ${
                    isActive
                      ? "bg-indigo-500 text-white shadow-md shadow-indigo-500/30"
                      : "bg-slate-800/80 text-slate-400 group-hover:text-slate-200"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                {!collapsed && label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle (desktop only) */}
      {onToggleCollapse && (
        <div className={`hidden border-t border-slate-800/80 py-2 lg:flex ${collapsed ? "justify-center" : "justify-end px-3"}`}>
          <button
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
      )}

      {/* User / logout */}
      <div className={`border-t border-slate-800/80 ${collapsed ? "p-2" : "p-4"}`}>
        <div className={`flex items-center gap-3 rounded-xl py-2 ${collapsed ? "flex-col gap-2 px-0" : "px-2"}`}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-slate-200">
            {user?.name?.[0]?.toUpperCase() || "U"}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{user?.name || "Guest"}</p>
              <p className="truncate text-xs text-slate-500">{user?.email || ""}</p>
            </div>
          )}
          <button
            type="button"
            onClick={handleLogout}
            title="Log out"
            aria-label="Log out"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-red-500/10 hover:text-red-300"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
