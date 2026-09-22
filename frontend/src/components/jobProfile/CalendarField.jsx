import { useEffect, useId, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import {
  formatDateLabel,
  formatMonthLabel,
  parseDateValue,
  parseMonthValue,
} from "./profileFields.js";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function clampYear(year) {
  return Math.min(2100, Math.max(1950, year));
}

export default function CalendarField({ mode = "month", value, onChange, className }) {
  const parsedMonth = parseMonthValue(value);
  const parsedDate = parseDateValue(value);
  const selected = mode === "date" ? parsedDate : parsedMonth;
  const label = mode === "date" ? formatDateLabel(value) : formatMonthLabel(value);
  const placeholder = mode === "date" ? "Select date" : "Select month";
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const today = new Date();
  const [viewYear, setViewYear] = useState(selected?.year || today.getFullYear());
  const [viewMonth, setViewMonth] = useState((selected?.month || today.getMonth() + 1) - 1);
  const rootRef = useRef(null);
  const dialogId = useId();

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function openPicker() {
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) setOpenUp(window.innerHeight - rect.bottom < 320 && rect.top > 320);
    const current = mode === "date" ? parseDateValue(value) : parseMonthValue(value);
    setViewYear(current?.year || new Date().getFullYear());
    setViewMonth((current?.month || new Date().getMonth() + 1) - 1);
    setOpen(true);
  }

  function selectMonth(monthNumber) {
    const month = String(monthNumber).padStart(2, "0");
    onChange(`${viewYear}-${month}`);
    setOpen(false);
  }

  function selectDay(day) {
    const month = String(viewMonth + 1).padStart(2, "0");
    const date = String(day).padStart(2, "0");
    onChange(`${viewYear}-${month}-${date}`);
    setOpen(false);
  }

  function shiftMonth(delta) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(clampYear(next.getFullYear()));
    setViewMonth(next.getMonth());
  }

  const daysInView = new Date(viewYear, viewMonth + 1, 0).getDate();
  const leadingBlanks = new Date(viewYear, viewMonth, 1).getDay();

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        onClick={() => (open ? setOpen(false) : openPicker())}
        className={`${className} flex items-center justify-between gap-2 text-left`}
      >
        <span className={label ? "text-slate-100" : "text-slate-500"}>{label || placeholder}</span>
        <Calendar className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {open && (
        <div
          id={dialogId}
          role="dialog"
          aria-label={mode === "date" ? "Choose a date" : "Choose a month"}
          className={`absolute z-30 w-72 rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-xl shadow-black/40 ${
            openUp ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => (mode === "date" ? shiftMonth(-1) : setViewYear((year) => clampYear(year - 1)))}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800"
              aria-label={mode === "date" ? "Previous month" : "Previous year"}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium text-white">
              {mode === "date" ? `${MONTHS_SHORT[viewMonth]} ${viewYear}` : viewYear}
            </span>
            <button
              type="button"
              onClick={() => (mode === "date" ? shiftMonth(1) : setViewYear((year) => clampYear(year + 1)))}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800"
              aria-label={mode === "date" ? "Next month" : "Next year"}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {mode === "date" ? (
            <>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-500">
                {WEEKDAYS.map((day) => (
                  <span key={day} className="py-1">
                    {day}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: leadingBlanks }, (_, index) => (
                  <span key={`blank-${index}`} />
                ))}
                {Array.from({ length: daysInView }, (_, index) => {
                  const day = index + 1;
                  const isSelected =
                    parsedDate?.year === viewYear && parsedDate?.month === viewMonth + 1 && parsedDate?.day === day;
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => selectDay(day)}
                      className={`h-8 rounded-lg text-xs font-medium ${
                        isSelected ? "bg-indigo-500 text-white" : "text-slate-200 hover:bg-slate-800"
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {MONTHS_SHORT.map((month, index) => {
                const monthNumber = index + 1;
                const isSelected = parsedMonth?.year === viewYear && parsedMonth?.month === monthNumber;
                return (
                  <button
                    key={month}
                    type="button"
                    onClick={() => selectMonth(monthNumber)}
                    className={`rounded-lg px-2 py-2 text-xs font-medium ${
                      isSelected ? "bg-indigo-500 text-white" : "text-slate-200 hover:bg-slate-800"
                    }`}
                  >
                    {month}
                  </button>
                );
              })}
            </div>
          )}

          {label && (
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="mt-3 w-full rounded-lg px-2 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
