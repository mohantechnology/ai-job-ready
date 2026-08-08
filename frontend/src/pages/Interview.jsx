import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Bot, Code2, MessageSquare, PenSquare, PhoneOff, User } from "lucide-react";
import { getInterview } from "../lib/api.js";
import { useRealtimeInterview } from "../hooks/useRealtimeInterview.js";
import SpeakingAvatar from "../components/SpeakingAvatar.jsx";
import TranscriptPanel from "../components/TranscriptPanel.jsx";
import TextEditorPanel from "../components/TextEditorPanel.jsx";
import IconButton from "../components/IconButton.jsx";
import MicControl from "../components/MicControl.jsx";

const CHAT_VISIBILITY_STORAGE_KEY = "interview-chat-visible";

// Excalidraw (and its mermaid/rough.js dependencies) is a multi-MB chunk -
// lazy-loaded so every candidate doesn't pay that download cost just to
// start an interview; it's only fetched the first time they open the
// whiteboard.
const WhiteboardPanel = lazy(() => import("../components/WhiteboardPanel.jsx"));

export default function Interview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [interview, setInterview] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorExpanded, setEditorExpanded] = useState(false);
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  const [whiteboardExpanded, setWhiteboardExpanded] = useState(false);
  const [chatVisible, setChatVisible] = useState(() => {
    try {
      return window.localStorage.getItem(CHAT_VISIBILITY_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const {
    status,
    errorMessage,
    clearError,
    transcript,
    speakingSide,
    questionIndex,
    totalQuestions,
    start,
    end,
    submitText,
    submitWhiteboard,
    whiteboardHistory,
    micEnabled,
    micVolume,
    toggleMic,
  } = useRealtimeInterview(interview);
  const startedRef = useRef(false);

  // Text editor and whiteboard are mutually exclusive - both default to the
  // same inline size/slot next to the transcript, so only one "answer panel"
  // occupies that slot at a time.
  const openEditor = () => {
    setWhiteboardOpen(false);
    setWhiteboardExpanded(false);
    setEditorOpen(true);
  };
  const closeEditor = () => {
    setEditorOpen(false);
    setEditorExpanded(false);
  };
  const openWhiteboard = () => {
    setEditorOpen(false);
    setEditorExpanded(false);
    setWhiteboardOpen(true);
  };
  const closeWhiteboard = () => {
    setWhiteboardOpen(false);
    setWhiteboardExpanded(false);
  };

  useEffect(() => {
    try {
      window.localStorage.setItem(CHAT_VISIBILITY_STORAGE_KEY, String(chatVisible));
    } catch {
      // The preference is optional; keep the interview usable when storage is unavailable.
    }
  }, [chatVisible]);

  useEffect(() => {
    getInterview(id)
      .then(({ interview: data }) => {
        if (data.status === "completed") {
          // Landed here via browser back/forward or a stale link after the
          // interview already finished - don't let it be re-started.
          navigate(`/results/${id}`, { replace: true });
          return;
        }
        setInterview(data);
      })
      .catch((err) => setLoadError(err.message || "Could not load this interview."));
  }, [id, navigate]);

  useEffect(() => {
    if (!interview || startedRef.current) return;
    startedRef.current = true;
    start();
  }, [interview, start]);

  useEffect(() => {
    if (status === "ended") {
      // Replace so the back button can't return to this now-finished
      // interview page and accidentally re-trigger the call.
      navigate(`/results/${id}`, { replace: true });
    }
  }, [status, id, navigate]);

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-sm text-red-300">
          {loadError}
        </div>
      </div>
    );
  }

  if (!interview) return null;

  const statusLabel = {
    idle: "Preparing...",
    connecting: "Connecting to your interviewer...",
    active: "Live",
    ending: "Wrapping up...",
    ended: "Interview complete",
    error: "Connection error",
  }[status];

  // A panel only claims a grid column while shown inline - once expanded to
  // full screen it renders as a fixed overlay instead, so the grid collapses
  // back as if no side panel were open.
  const editorInline = editorOpen && !editorExpanded;
  const whiteboardInline = whiteboardOpen && !whiteboardExpanded;
  const answerPanelInline = editorInline || whiteboardInline;
  const avatarsOnly = !chatVisible && !answerPanelInline;
  const gridColsClass = answerPanelInline
    ? chatVisible
      ? "md:grid-cols-[280px_1fr_1fr]"
      : "md:grid-cols-[280px_1fr]"
    : chatVisible
      ? "md:grid-cols-[280px_1fr]"
      : "md:grid-cols-1";
  const statusNeedsAttention = status === "connecting" || status === "ending";
  const statusClass = statusNeedsAttention
    ? `animate-pulse px-4 py-2 text-xs shadow-lg ring-1 motion-reduce:animate-none ${
        status === "ending"
          ? "bg-amber-500/15 text-amber-300 shadow-amber-500/20 ring-amber-400/40"
          : "bg-indigo-500/20 text-indigo-200 shadow-indigo-500/30 ring-indigo-400/50"
      }`
    : status === "active"
      ? "bg-emerald-500/15 px-3 py-1 text-xs text-emerald-300"
      : status === "error"
        ? "bg-red-500/15 px-3 py-1 text-xs text-red-300"
        : "bg-slate-800 px-3 py-1 text-xs text-slate-300";

  return (
    <div className="flex min-h-screen flex-col px-4 py-8">
      <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-white">{interview.jobTitle || "Interview"}</h1>
          <p className="text-xs capitalize text-slate-400">
            {interview.role} &middot;{" "}
            {interview.typeOfInterview === "other"
              ? interview.typeOfInterviewOther || "other"
              : interview.typeOfInterview}{" "}
            interview
          </p>
          <p className="text-xs text-slate-400">{interview.topics.join(", ")}</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            role="status"
            aria-live="polite"
            className={`flex items-center gap-2 whitespace-nowrap rounded-full font-semibold ${statusClass}`}
          >
            <span className="relative flex h-2 w-2">
              {statusNeedsAttention && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60 motion-reduce:animate-none" />
              )}
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${
                  status === "active" ? "bg-emerald-400" : statusNeedsAttention ? "bg-current" : "bg-slate-500"
                }`}
              />
            </span>
            {statusLabel}
          </span>
          {totalQuestions && (
            <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300">
              Question {Math.min(questionIndex + 1, totalQuestions)} of {totalQuestions}
            </span>
          )}
        </div>
      </header>

      <div className="mx-auto mt-4 flex w-full max-w-6xl items-center justify-end gap-3 border-t border-slate-800/60 pb-2 pt-4">
        <IconButton
          icon={MessageSquare}
          label={chatVisible ? "Hide chat transcript" : "Show chat transcript"}
          active={chatVisible}
          onClick={() => setChatVisible((v) => !v)}
        />
        <IconButton
          icon={Code2}
          label="Write a text or code answer"
          active={editorOpen}
          onClick={() => (editorOpen ? closeEditor() : openEditor())}
        />
        <IconButton
          icon={PenSquare}
          label="Draw a whiteboard answer"
          active={whiteboardOpen}
          onClick={() => (whiteboardOpen ? closeWhiteboard() : openWhiteboard())}
        />
      </div>

      {errorMessage && (
        <div className="mx-auto mt-4 flex w-full max-w-6xl items-start justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={clearError}
            aria-label="Dismiss error"
            className="shrink-0 rounded-md p-0.5 text-red-300/70 transition hover:bg-red-500/20 hover:text-red-200"
          >
            ✕
          </button>
        </div>
      )}

      <main className={`mx-auto mt-6 grid h-[65vh] min-h-[420px] w-full max-w-6xl gap-8 ${gridColsClass}`}>
        <div
          className={`relative isolate flex items-center justify-center overflow-hidden rounded-2xl border p-8 ${
            avatarsOnly
              ? "flex-col gap-10 border-slate-700/70 bg-gradient-to-br from-slate-900/90 via-slate-950/60 to-indigo-950/40 shadow-2xl shadow-indigo-950/20 lg:flex-row lg:gap-24"
              : "flex-col gap-10 border-slate-800 bg-slate-900/40"
          }`}
        >
          {avatarsOnly && (
            <>
              <div
                aria-hidden="true"
                className="absolute left-[15%] top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-sky-500/10 blur-3xl"
              />
              <div
                aria-hidden="true"
                className="absolute right-[15%] top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-indigo-500/10 blur-3xl"
              />
              <div
                aria-hidden="true"
                className="absolute left-1/2 top-1/2 hidden h-px w-32 -translate-x-1/2 bg-gradient-to-r from-sky-400/10 via-slate-500/70 to-indigo-400/10 lg:block"
              />
            </>
          )}
          <div className="relative z-10">
            <SpeakingAvatar
              label="Interviewer"
              icon={Bot}
              isSpeaking={speakingSide === "assistant"}
              colorClass="bg-sky-500/70"
            />
          </div>
          <div className="relative z-10">
            <SpeakingAvatar
              label="You"
              icon={User}
              isSpeaking={speakingSide === "user"}
              colorClass="bg-indigo-500/70"
              muted={!micEnabled}
            />
          </div>
        </div>

        {chatVisible && (
          <div className="flex h-full min-h-0 flex-col">
            <TranscriptPanel transcript={transcript} />
          </div>
        )}

        {editorOpen && (
          <TextEditorPanel
            open={editorOpen}
            expanded={editorExpanded}
            onToggleExpand={() => setEditorExpanded((v) => !v)}
            onClose={closeEditor}
            onSubmit={submitText}
            disabled={status !== "active"}
            history={transcript.filter((entry) => entry.kind === "text")}
          />
        )}

        {whiteboardOpen && (
          <Suspense fallback={null}>
            <WhiteboardPanel
              open={whiteboardOpen}
              expanded={whiteboardExpanded}
              onToggleExpand={() => setWhiteboardExpanded((v) => !v)}
              onClose={closeWhiteboard}
              onSubmit={submitWhiteboard}
              disabled={status !== "active"}
              history={whiteboardHistory}
            />
          </Suspense>
        )}
      </main>

      <footer className="mx-auto mt-6 flex w-full max-w-6xl items-center justify-center gap-4">
        <MicControl
          enabled={micEnabled}
          level={micVolume}
          onClick={toggleMic}
          disabled={status !== "active"}
        />
        <button
          type="button"
          onClick={end}
          disabled={status !== "active"}
          className="flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 px-6 py-3 text-sm font-semibold text-red-300 shadow-lg shadow-red-500/10 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <PhoneOff size={16} strokeWidth={2} />
          End call
        </button>
      </footer>
    </div>
  );
}
