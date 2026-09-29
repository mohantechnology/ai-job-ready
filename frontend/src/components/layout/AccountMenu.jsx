import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Check, ChevronRight, LogOut, MoreVertical, SunMoon, UserRound } from "lucide-react";

const APPEARANCE_KEY = "jobready_appearance";
const APPEARANCE_OPTIONS = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

function readAppearance() {
  try {
    const value = window.localStorage.getItem(APPEARANCE_KEY);
    return APPEARANCE_OPTIONS.some((item) => item.id === value) ? value : "system";
  } catch {
    return "system";
  }
}

export default function AccountMenu({ collapsed = false, user, onLogout, onNavigate, flyout = true }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [appearance, setAppearance] = useState(readAppearance);
  const rootRef = useRef(null);
  const initial = user?.name?.[0]?.toUpperCase() || "U";

  useEffect(() => {
    setOpen(false);
    setAppearanceOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
        setAppearanceOpen(false);
      }
    }
    function onKey(event) {
      if (event.key === "Escape") {
        setOpen(false);
        setAppearanceOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function close() {
    setOpen(false);
    setAppearanceOpen(false);
  }

  function chooseAppearance(next) {
    setAppearance(next);
    try {
      window.localStorage.setItem(APPEARANCE_KEY, next);
    } catch {
      // The choice still shows in this session if storage is blocked.
    }
  }

  function openProfile() {
    close();
    onNavigate?.();
    navigate("/setting/profile");
  }

  const menu = open && (
    <div
      role="menu"
      className={`absolute z-50 rounded-xl border border-white/10 bg-[#161616] py-1.5 shadow-2xl shadow-black/50 ${
        collapsed ? "bottom-0 left-full ml-2 w-56" : "bottom-full left-0 right-0 mb-2"
      }`}
    >
      <button
        type="button"
        role="menuitem"
        onClick={openProfile}
        className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/[0.06]"
      >
        <UserRound className="h-4 w-4 text-slate-400" />
        Profile
      </button>

      <div
        className="relative"
        onMouseEnter={() => {
          if (flyout) setAppearanceOpen(true);
        }}
        onMouseLeave={() => {
          if (flyout) setAppearanceOpen(false);
        }}
      >
        <button
          type="button"
          role="menuitem"
          aria-expanded={appearanceOpen}
          onClick={() => {
            if (flyout) setAppearanceOpen(true);
            else setAppearanceOpen((current) => !current);
          }}
          className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/[0.06]"
        >
          <SunMoon className="h-4 w-4 text-slate-400" />
          <span className="flex-1">Appearance</span>
          <ChevronRight className="h-4 w-4 text-slate-500" />
        </button>
        {appearanceOpen && (
          <div
            role="menu"
            className={
              flyout
                ? "absolute bottom-0 left-full z-50 ml-1 w-40 rounded-xl border border-white/10 bg-[#161616] py-1.5 shadow-2xl shadow-black/50"
                : "mx-2 mb-1 rounded-lg bg-white/[0.04] py-1"
            }
          >
            {APPEARANCE_OPTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitemradio"
                aria-checked={appearance === item.id}
                onClick={() => chooseAppearance(item.id)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/[0.06]"
              >
                {item.label}
                {appearance === item.id && <Check className="h-4 w-4 text-slate-300" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="my-1 border-t border-white/10" />

      <button
        type="button"
        role="menuitem"
        onClick={() => {
          close();
          onLogout();
        }}
        className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/[0.06]"
      >
        <LogOut className="h-4 w-4 text-slate-400" />
        Log out
      </button>
    </div>
  );

  if (collapsed) {
    return (
      <div ref={rootRef} className="relative flex justify-center">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-label="Account menu"
          aria-expanded={open}
          title={user?.name || "Account"}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-slate-200 transition hover:bg-slate-700"
        >
          {initial}
        </button>
        {menu}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative flex items-center gap-3 px-2 py-2">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-slate-200">
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{user?.name || "Guest"}</p>
        <p className="truncate text-xs text-slate-500">{user?.email || ""}</p>
      </div>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label="Account menu"
        aria-expanded={open}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {menu}
    </div>
  );
}
