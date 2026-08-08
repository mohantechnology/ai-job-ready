import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronDown, ChevronUp, Code2, PenSquare } from "lucide-react";
import { getInterview, getWhiteboardSubmissionImageUrl } from "../lib/api.js";

const TABS = [
  { id: "summary", label: "Summary" },
  { id: "chat", label: "Chat" },
];

export default function Results() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [interview, setInterview] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [whiteboardSubmissions, setWhiteboardSubmissions] = useState([]);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("summary");

  useEffect(() => {
    getInterview(id)
      .then(({ interview: data, questions: questionData, whiteboardSubmissions: whiteboardData }) => {
        setInterview(data);
        setQuestions(questionData || []);
        setWhiteboardSubmissions(whiteboardData || []);
      })
      .catch((err) => setError(err.message || "Could not load this interview."));
  }, [id]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-sm text-red-300">
          {error}
        </div>
      </div>
    );
  }

  if (!interview) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        Loading results...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-10">
      <div className="w-full max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">{interview.jobTitle || "Interview"} complete</h1>
            <p className="mt-1 text-sm capitalize text-slate-400">
              {interview.role} &middot;{" "}
              {interview.typeOfInterview === "other"
                ? interview.typeOfInterviewOther || "other"
                : interview.typeOfInterview}{" "}
              &middot; {interview.topics.join(", ")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:border-indigo-400 hover:text-indigo-300"
          >
            Back to interviews
          </button>
        </div>

        <div className="mb-6 flex gap-2 rounded-xl border border-slate-800 bg-slate-900/40 p-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition ${
                activeTab === tab.id
                  ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "summary" && (
          <SummaryTab interview={interview} questions={questions} whiteboardSubmissions={whiteboardSubmissions} />
        )}
        {activeTab === "chat" && <ChatTab interview={interview} />}
      </div>
    </div>
  );
}

function SummaryTab({ interview, questions, whiteboardSubmissions }) {
  const { summary, transcript, numberOfQuestions, endedReason } = interview;
  const questionCount = transcript.filter((e) => e.role === "assistant").length;

  // Text/code submissions are tagged with the question index that was active
  // when the candidate sent them (see useRealtimeInterview.js submitText),
  // so we can surface them right next to the matching question below.
  const textSubmissionsByQuestion = transcript
    .filter((e) => e.kind === "text")
    .reduce((acc, entry) => {
      const key = entry.questionOrderIndex ?? 0;
      (acc[key] ||= []).push(entry);
      return acc;
    }, {});

  // Whiteboard drawings are persisted separately (whiteboard_submissions
  // table, see backend/src/repositories/whiteboardSubmissions.repository.js)
  // rather than inline in the transcript, but tagged with the same
  // question-order-index convention so they can be grouped the same way.
  const whiteboardSubmissionsByQuestion = whiteboardSubmissions.reduce((acc, submission) => {
    const key = submission.questionOrderIndex ?? 0;
    (acc[key] ||= []).push(submission);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Questions asked" value={questionCount} />
        <StatCard label="Planned" value={numberOfQuestions} />
        <StatCard label="Ended by" value={endedReason || "unknown"} />
      </div>

      {!summary && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-400">
          We couldn't generate a score for this interview yet. Check the Chat tab to review the full conversation.
        </div>
      )}

      {summary && (
        <>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-indigo-500/60 text-xl font-bold text-white">
                {summary.overallScore}
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">Overall score</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-300">{summary.overallFeedback}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {summary.strengths?.length > 0 && (
              <FeedbackList title="Strengths" items={summary.strengths} tone="emerald" />
            )}
            {summary.improvements?.length > 0 && (
              <FeedbackList title="Areas to improve" items={summary.improvements} tone="amber" />
            )}
          </div>

          {summary.topics?.length > 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
                Score by topic
              </h2>
              <div className="space-y-3">
                {summary.topics.map((topic) => (
                  <div key={topic.topic}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-200">{topic.topic}</span>
                      <span className="text-slate-400">{topic.score}/100</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-indigo-500"
                        style={{ width: `${Math.max(0, Math.min(100, topic.score))}%` }}
                      />
                    </div>
                    {topic.feedback && <p className="mt-1.5 text-xs text-slate-400">{topic.feedback}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {questions?.length > 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
                Question breakdown
              </h2>
              <div className="space-y-4">
                {questions.map((q, i) => (
                  <QuestionBreakdownItem
                    key={q.id}
                    question={q}
                    index={i}
                    submissions={textSubmissionsByQuestion[i] || []}
                    whiteboardSubmissions={whiteboardSubmissionsByQuestion[i] || []}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function QuestionBreakdownItem({ question: q, index: i, submissions, whiteboardSubmissions = [] }) {
  const [codeOpen, setCodeOpen] = useState(false);
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  const hasSubmissions = submissions.length > 0;
  const hasWhiteboardSubmissions = whiteboardSubmissions.length > 0;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-100">
          {i + 1}. {q.questionText}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {hasWhiteboardSubmissions && (
            <button
              type="button"
              onClick={() => setWhiteboardOpen((v) => !v)}
              title={`View whiteboard drawing${whiteboardSubmissions.length > 1 ? "s" : ""} for this question`}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${
                whiteboardOpen
                  ? "bg-indigo-500 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
              }`}
            >
              <PenSquare size={12} strokeWidth={2} />
              {whiteboardSubmissions.length > 1 ? `${whiteboardSubmissions.length} drawings` : "Drawing"}
              {whiteboardOpen ? <ChevronUp size={12} strokeWidth={2} /> : <ChevronDown size={12} strokeWidth={2} />}
            </button>
          )}
          {hasSubmissions && (
            <button
              type="button"
              onClick={() => setCodeOpen((v) => !v)}
              title={`View text/code submission${submissions.length > 1 ? "s" : ""} for this question`}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${
                codeOpen
                  ? "bg-indigo-500 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
              }`}
            >
              <Code2 size={12} strokeWidth={2} />
              {submissions.length > 1 ? `${submissions.length} submissions` : "Code"}
              {codeOpen ? <ChevronUp size={12} strokeWidth={2} /> : <ChevronDown size={12} strokeWidth={2} />}
            </button>
          )}
          {q.score != null && (
            <span className="rounded-full bg-indigo-500/15 px-2.5 py-1 text-xs font-semibold text-indigo-300">
              {q.score}/10
            </span>
          )}
        </div>
      </div>
      {q.answer && <p className="mt-2 text-sm text-slate-400">{q.answer}</p>}
      {q.feedback && <p className="mt-2 text-xs italic text-slate-500">{q.feedback}</p>}

      {whiteboardOpen && hasWhiteboardSubmissions && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {whiteboardSubmissions.map((s) => (
            <WhiteboardThumbnail key={s.id} interviewId={s.interviewId} submissionId={s.id} />
          ))}
        </div>
      )}

      {codeOpen && hasSubmissions && (
        <div className="mt-3 space-y-2">
          {submissions.map((s) => (
            <div key={s.id} className="rounded-lg border border-slate-800 bg-slate-900/80 p-3">
              {s.language && (
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {s.language}
                </p>
              )}
              <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-indigo-100">
                {s.text}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Fetches the actual image bytes lazily (only once expanded) and only once
// per mount, since each is an authenticated request that can't just be a
// plain <img src="..."> URL (no way to attach the Authorization header).
function WhiteboardThumbnail({ interviewId, submissionId }) {
  const [objectUrl, setObjectUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let currentUrl = null;
    getWhiteboardSubmissionImageUrl(interviewId, submissionId)
      .then((url) => {
        currentUrl = url;
        setObjectUrl(url);
      })
      .catch(() => setFailed(true));
    return () => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [interviewId, submissionId]);

  if (failed) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-lg border border-slate-800 bg-slate-900/80 text-xs text-slate-500">
        Couldn't load
      </div>
    );
  }

  return (
    <a href={objectUrl || undefined} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-slate-800 bg-white">
      {objectUrl ? (
        <img src={objectUrl} alt="Whiteboard drawing submitted by candidate" className="aspect-video w-full object-contain" />
      ) : (
        <div className="aspect-video w-full animate-pulse bg-slate-800" />
      )}
    </a>
  );
}

function ChatTab({ interview }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Full transcript</h2>
      <div className="space-y-4">
        {interview.transcript.length === 0 && (
          <p className="text-sm text-slate-500">No transcript was captured for this interview.</p>
        )}
        {interview.transcript.map((entry) => (
          <div key={entry.id} className={`flex ${entry.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                entry.role === "user" ? "bg-indigo-500/20 text-indigo-100" : "bg-slate-800/80 text-slate-200"
              }`}
            >
              <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {entry.role === "user" ? "You" : "Interviewer"}
                {entry.kind === "text" && (
                  <span className="flex items-center gap-1 rounded-full bg-slate-700/60 px-1.5 py-0.5 text-[9px] font-medium normal-case text-slate-300">
                    <Code2 size={10} strokeWidth={2} />
                    {entry.language || "text"}
                  </span>
                )}
                {entry.kind === "whiteboard" && (
                  <span className="flex items-center gap-1 rounded-full bg-slate-700/60 px-1.5 py-0.5 text-[9px] font-medium normal-case text-slate-300">
                    <PenSquare size={10} strokeWidth={2} />
                    whiteboard
                  </span>
                )}
              </p>
              {entry.kind === "text" ? (
                <pre className="whitespace-pre-wrap break-words font-mono text-xs text-indigo-100">{entry.text}</pre>
              ) : entry.kind === "whiteboard" ? (
                entry.submissionId ? (
                  <div className="w-48">
                    <WhiteboardThumbnail interviewId={interview.id} submissionId={entry.submissionId} />
                  </div>
                ) : (
                  <p className="text-slate-400">{entry.text}</p>
                )
              ) : (
                <p>{entry.text}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-center">
      <p className="text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{label}</p>
    </div>
  );
}

function FeedbackList({ title, items, tone }) {
  const toneClass = tone === "emerald" ? "text-emerald-300" : "text-amber-300";
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <h3 className={`mb-3 text-sm font-semibold ${toneClass}`}>{title}</h3>
      <ul className="space-y-1.5 text-sm text-slate-300">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className={toneClass}>&bull;</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
