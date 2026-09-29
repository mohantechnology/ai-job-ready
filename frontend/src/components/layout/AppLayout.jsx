import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Menu, Mic } from "lucide-react";
import Sidebar from "./Sidebar.jsx";

const COLLAPSE_STORAGE_KEY = "jobready_sidebar_collapsed";

function getInitialCollapsed() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);
  const location = useLocation();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore - collapse state just won't persist across reloads
      }
      return next;
    });
  }

  return (
    <div className="flex min-h-screen bg-slate-950">
      {/* Desktop sidebar */}
      <aside className={`hidden shrink-0 transition-[width] duration-200 lg:block ${collapsed ? "lg:w-20" : "lg:w-72"}`}>
        <div className={`fixed inset-y-0 left-0 z-40 transition-[width] duration-200 ${collapsed ? "w-20" : "w-72"}`}>
          <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[82vw] shadow-2xl">
            <Sidebar onNavigate={() => setMobileOpen(false)} onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-800/80 bg-slate-950/90 px-4 py-3 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="rounded-lg p-2 text-slate-300 transition hover:bg-slate-800"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500">
              <Mic className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-white">JobReady</span>
          </div>
        </header>
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
