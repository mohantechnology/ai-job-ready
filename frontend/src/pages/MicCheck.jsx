import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMicMeter } from "../hooks/useMicMeter.js";
import { getInterview } from "../lib/api.js";

export default function MicCheck() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [interview, setInterview] = useState(null);
  const [loadError, setLoadError] = useState("");
  const { permissionState, devices, selectedDeviceId, volume, error, retry, switchDevice, stopMeter } =
    useMicMeter();

  useEffect(() => {
    getInterview(id)
      .then(({ interview: data }) => {
        if (data.status === "completed") {
          navigate(`/results/${id}`, { replace: true });
          return;
        }
        setInterview(data);
      })
      .catch((err) => setLoadError(err.message || "Could not load this interview."));
  }, [id, navigate]);

  function handleContinue() {
    stopMeter();
    // Replace so the back button skips the mic-check step and lands on the
    // dashboard instead of re-entering the flow for this interview.
    navigate(`/interview/${id}`, { replace: true });
  }

  const barCount = 20;
  const activeBars = Math.round(volume * barCount);

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-sm text-red-300">
          {loadError}
        </div>
      </div>
    );
  }

  if (!interview) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading...</div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-2xl shadow-black/40 backdrop-blur">
        <h1 className="text-2xl font-semibold text-white">Microphone check</h1>
        <p className="mt-2 text-sm text-slate-400">
          Let's make sure your microphone works before we start your {interview.jobTitle || "interview"} (
          {interview.role} &middot;{" "}
          {interview.typeOfInterview === "other"
            ? interview.typeOfInterviewOther || "other"
            : interview.typeOfInterview}
          ) interview.
        </p>

        <div className="mt-8">
          {permissionState === "checking" && (
            <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-300">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-400" />
              Requesting microphone access...
            </div>
          )}

          {permissionState === "denied" && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
              <p className="font-medium">We couldn't access your microphone.</p>
              <p className="mt-1 text-red-300/80">
                {error || "Please allow microphone access in your browser's permission settings, then try again."}
              </p>
              <ol className="mt-3 list-decimal space-y-1 pl-4 text-red-300/70">
                <li>Click the lock/site-info icon in your browser's address bar.</li>
                <li>Set Microphone permission to "Allow" for this site.</li>
                <li>Reload or click "Try again" below.</li>
              </ol>
              <button
                type="button"
                onClick={retry}
                className="mt-4 rounded-lg bg-red-500/20 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-500/30"
              >
                Try again
              </button>
            </div>
          )}

          {permissionState === "granted" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
                Microphone access granted. Speak to see the level meter move.
              </div>

              {devices.length > 1 && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">Input device</label>
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => switchDevice(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400"
                  >
                    {devices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || "Microphone"}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <p className="mb-2 text-xs font-medium text-slate-400">Live input level</p>
                <div className="flex h-16 items-end gap-1 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  {Array.from({ length: barCount }).map((_, i) => (
                    <div
                      key={i}
                      className={`flex-1 rounded-sm transition-all duration-75 ${
                        i < activeBars ? "bg-emerald-400" : "bg-slate-800"
                      }`}
                      style={{ height: `${Math.max(10, ((i + 1) / barCount) * 100)}%` }}
                    />
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleContinue}
                className="w-full rounded-lg bg-indigo-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400"
              >
                Start interview
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
