import { useEffect, useId, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { RANGE_OPTIONS, formatUtcDay, todayUtcIso } from "../../lib/dateRange.js";

function isoToUtcDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function utcDateToIso(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function RangeFilter({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState();
  const [month, setMonth] = useState(() => isoToUtcDate(todayUtcIso()));
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
    const from = value.range === "custom" && value.from ? isoToUtcDate(value.from) : undefined;
    const to = value.range === "custom" && value.to ? isoToUtcDate(value.to) : undefined;
    setDraft(from ? { from, to } : undefined);
    setMonth(from || isoToUtcDate(todayUtcIso()));
    setOpen(true);
  }

  function apply() {
    if (!draft?.from) return;
    const start = utcDateToIso(draft.from);
    const end = utcDateToIso(draft.to || draft.from);
    const from = start <= end ? start : end;
    const to = start <= end ? end : start;
    onChange({ range: "custom", from, to });
    setOpen(false);
  }

  const draftLabel = draft?.from
    ? `${formatUtcDay(utcDateToIso(draft.from))} – ${formatUtcDay(utcDateToIso(draft.to || draft.from))}`
    : "Select a start date";

  return (
    <div ref={rootRef} className="relative flex max-w-full flex-wrap items-center gap-1">
      <div className="flex max-w-full flex-wrap rounded-xl border border-white/10 bg-white/[0.03] p-1">
        {RANGE_OPTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setOpen(false);
              onChange({ range: item.id, from: "", to: "" });
            }}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
              !open && value.range === item.id ? "bg-white text-slate-900" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={dialogId}
          onClick={() => (open ? setOpen(false) : openPicker())}
          className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
            open || value.range === "custom" ? "bg-white text-slate-900" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Custom
        </button>
      </div>

      {open && (
        <div
          id={dialogId}
          role="dialog"
          aria-label="Custom date range"
          className="absolute right-0 top-full z-40 mt-2 w-[19.5rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-[#141414] p-4 shadow-2xl shadow-black/50"
        >
          <p className="text-xs text-slate-500">{draftLabel}</p>
          <DayPicker
            mode="range"
            timeZone="UTC"
            weekStartsOn={0}
            resetOnSelect
            selected={draft}
            onSelect={setDraft}
            month={month}
            onMonthChange={setMonth}
            className="range-calendar mt-2"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={!draft?.from}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:text-slate-500"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
