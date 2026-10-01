import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Briefcase,
  IdCard,
  LayoutDashboard,
  MessageSquare,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  Shield,
  SlidersHorizontal,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import AccountMenu from "./AccountMenu.jsx";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/interviews", label: "Interviews", icon: MessageSquare, end: true },
  { to: "/applied-jobs", label: "Applied Jobs", icon: Briefcase },
  { to: "/job-profile", label: "Job Profile", icon: IdCard },
];

const ADMIN_NAV_ITEMS = [
  { to: "/admin", label: "Admin Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/models", label: "Manage models", icon: SlidersHorizontal },
];

const APP_NAME = "JobReady";

export default function Sidebar({ collapsed = false, onToggleCollapse, onNavigate, onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "admin";
  const adminMode = location.pathname === "/admin" || location.pathname.startsWith("/admin/");
  const navItems = isAdmin && adminMode ? ADMIN_NAV_ITEMS : NAV_ITEMS;
  const modeLabel = adminMode ? "Switch to User mode" : "Switch to Admin mode";
  const ModeIcon = adminMode ? UserRound : Shield;

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
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
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

      {isAdmin && (
        <div className={`border-t border-slate-800/80 pt-2 ${collapsed ? "px-2" : "px-3"}`}>
          <NavLink
            to={adminMode ? "/dashboard" : "/admin"}
            onClick={onNavigate}
            title={modeLabel}
            className={`group flex items-center rounded-xl text-sm font-medium text-amber-200/90 transition hover:bg-slate-800/70 hover:text-amber-100 ${
              collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"
            }`}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300">
              <ModeIcon className="h-4 w-4" />
            </span>
            {!collapsed && modeLabel}
          </NavLink>
        </div>
      )}

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

      <div className={`border-t border-slate-800/80 ${collapsed ? "p-2" : "p-4"}`}>
        <AccountMenu collapsed={collapsed} user={user} onLogout={handleLogout} onNavigate={onNavigate} flyout={!onClose} />
      </div>
    </div>
  );
}
