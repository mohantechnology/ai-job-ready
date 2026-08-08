import { useState } from "react";

export default function TagInput({ tags, onAdd, onRemove, placeholder, suggestions = [] }) {
  const [value, setValue] = useState("");

  function commitValue() {
    const trimmed = value.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onAdd(trimmed);
    }
    setValue("");
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitValue();
    } else if (e.key === "Backspace" && !value && tags.length) {
      onRemove(tags[tags.length - 1]);
    }
  }

  return (
    <div>
      <div className="flex min-h-[3rem] flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/40 p-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1.5 rounded-full bg-indigo-500/15 px-3 py-1 text-sm font-medium text-indigo-300"
          >
            {tag}
            <button
              type="button"
              onClick={() => onRemove(tag)}
              className="text-indigo-300/70 hover:text-indigo-100"
              aria-label={`Remove ${tag}`}
            >
              &times;
            </button>
          </span>
        ))}
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitValue}
          placeholder={tags.length ? "" : placeholder}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-sm text-slate-100 outline-none placeholder:text-slate-500"
        />
      </div>

      {suggestions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions
            .filter((s) => !tags.includes(s))
            .map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onAdd(s)}
                className="rounded-full border border-slate-800 px-3 py-1 text-xs text-slate-400 hover:border-indigo-400 hover:text-indigo-300"
              >
                + {s}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
