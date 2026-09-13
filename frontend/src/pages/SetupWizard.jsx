import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import WizardShell from "../components/wizard/WizardShell.jsx";
import OptionCard from "../components/wizard/OptionCard.jsx";
import TagInput from "../components/wizard/TagInput.jsx";
import NumberStepper from "../components/wizard/NumberStepper.jsx";
import AssistanceSlider from "../components/wizard/AssistanceSlider.jsx";
import { createInterview, getLatestResume } from "../lib/api.js";
import { extractTextFromPdf } from "../lib/resumeParser.js";

const ROLE_OPTIONS = [
  { value: "junior", label: "Junior", description: "0-2 years of experience" },
  { value: "mid", label: "Mid-level", description: "2-5 years of experience" },
  { value: "senior", label: "Senior", description: "5+ years of experience" },
];

const TYPE_OPTIONS = [
  { value: "technical", label: "Technical", description: "Coding, systems, and domain knowledge" },
  { value: "non-technical", label: "Non-technical", description: "Behavioral and soft-skills questions" },
  { value: "mix", label: "Mix", description: "A blend of technical and behavioral questions" },
  { value: "other", label: "Other", description: "Something else - tell us what you want" },
];

const JOB_TITLE_SUGGESTIONS = [
  "Full Stack Developer",
  "Frontend Developer",
  "Backend Developer",
  "Software Engineer",
  "DevOps Engineer",
  "Data Analyst",
  "Data Scientist",
  "Product Manager",
  "QA Engineer",
  "Mobile Developer",
  "Business Analyst",
  "HR Executive",
];

const TOPIC_SUGGESTIONS = ["React", "JavaScript", "HTML", "CSS", "Node.js", "System Design", "SQL", "Communication"];

const MAX_TOPICS = 20;
const MIN_QUESTIONS = 1;
const MAX_QUESTIONS = 29;
const MAX_ADDITIONAL_INFO_LENGTH = 2000;

const TOTAL_STEPS = 8;

export default function SetupWizard() {
  const navigate = useNavigate();
  const location = useLocation();
  // If we arrived here from an "Applied jobs" card, use its details to
  // pre-fill the job title and topics so the wizard starts one step ahead.
  const prefill = location.state || null;

  const [step, setStep] = useState(1);
  const [jobTitle, setJobTitle] = useState(prefill?.prefillJobTitle || "");
  const [role, setRole] = useState("");
  const [typeOfInterview, setTypeOfInterview] = useState("");
  const [typeOfInterviewOther, setTypeOfInterviewOther] = useState("");
  const [topics, setTopics] = useState(prefill?.prefillTopics || []);
  const [numberOfQuestions, setNumberOfQuestions] = useState(5);

  const [existingResumeText, setExistingResumeText] = useState("");
  const [isLoadingExistingResume, setIsLoadingExistingResume] = useState(true);
  const [resumeMode, setResumeMode] = useState(null); // "existing" | "upload" | "text" | "skipped"
  const [resumeText, setResumeText] = useState("");
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [resumeError, setResumeError] = useState("");
  // Where "edit text" mode should return to (and what text to restore) if the
  // user closes out of it without wanting to keep editing.
  const [resumeModeBeforeEdit, setResumeModeBeforeEdit] = useState(null);
  const [resumeTextBeforeEdit, setResumeTextBeforeEdit] = useState("");

  const [additionalInfo, setAdditionalInfo] = useState("");
  const [assistanceLevel, setAssistanceLevel] = useState("on_request");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getLatestResume()
      .then(({ resumeText: previous }) => {
        if (cancelled) return;
        if (previous) {
          setExistingResumeText(previous);
          setResumeText(previous);
          setResumeMode("existing");
        }
      })
      .catch(() => {
        // Best-effort - if this fails the resume step just starts empty.
      })
      .finally(() => {
        if (!cancelled) setIsLoadingExistingResume(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const canGoNext = useMemo(() => {
    if (step === 1) return Boolean(jobTitle.trim());
    if (step === 2) return Boolean(role);
    if (step === 3) return Boolean(typeOfInterview) && (typeOfInterview !== "other" || Boolean(typeOfInterviewOther.trim()));
    if (step === 4) return topics.length > 0 && topics.length <= MAX_TOPICS;
    if (step === 5) return numberOfQuestions >= MIN_QUESTIONS && numberOfQuestions <= MAX_QUESTIONS;
    if (step === 6) return !isParsingPdf;
    return true;
  }, [step, jobTitle, role, typeOfInterview, typeOfInterviewOther, topics, numberOfQuestions, isParsingPdf]);

  // The resume step's "Skip" footer button should only show on the initial
  // upload-choice screen ("Upload resume (PDF)" / "Write resume as text"),
  // not once a resume is already loaded/uploaded or while editing as text.
  const isOnResumeChoiceScreen =
    !isLoadingExistingResume && resumeMode !== "existing" && resumeMode !== "upload" && resumeMode !== "text" && resumeMode !== "skipped";

  async function handleSubmit() {
    setIsSubmitting(true);
    setError("");
    try {
      await createInterview({
        jobTitle: jobTitle.trim(),
        role,
        typeOfInterview,
        typeOfInterviewOther: typeOfInterview === "other" ? typeOfInterviewOther.trim() : undefined,
        topics,
        numberOfQuestions,
        resumeText: resumeMode === "skipped" ? undefined : resumeText,
        additionalInfo: additionalInfo.trim() || undefined,
        assistanceLevel,
      });
      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "Something went wrong creating your interview.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleNext() {
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  }

  function handleBack() {
    setStep((s) => Math.max(1, s - 1));
  }

  async function handlePdfUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setResumeError("");
    setIsParsingPdf(true);
    try {
      const text = await extractTextFromPdf(file);
      if (!text) {
        setResumeError("Couldn't find any text in that PDF. Try a different file or write it as text instead.");
        return;
      }
      setResumeText(text);
      setResumeMode("upload");
    } catch (err) {
      setResumeError(err.message || "Failed to read that PDF. Try a different file or write it as text instead.");
    } finally {
      setIsParsingPdf(false);
    }
  }

  function handleSkipResume() {
    setResumeMode("skipped");
    setResumeText("");
    setResumeError("");
  }

  function handleChangeResume() {
    setResumeMode(null);
    setResumeText("");
    setResumeError("");
  }

  function handleEditResumeText() {
    setResumeModeBeforeEdit(resumeMode);
    setResumeTextBeforeEdit(resumeText);
    setResumeMode("text");
    setResumeError("");
  }

  function handleStartWritingResume() {
    setResumeModeBeforeEdit(null);
    setResumeTextBeforeEdit("");
    setResumeMode("text");
    setResumeText("");
  }

  function handleCloseResumeText() {
    if (resumeModeBeforeEdit) {
      setResumeMode(resumeModeBeforeEdit);
      setResumeText(resumeTextBeforeEdit);
    } else {
      setResumeMode(null);
      setResumeText("");
    }
    setResumeError("");
  }

  const titles = [
    "What job title are you interviewing for?",
    "What role level are you interviewing for?",
    "What type of interview do you want?",
    "Which topics should we cover?",
    "How many questions would you like?",
    "Use your resume?",
    "Anything else we should know?",
    "How much should the interviewer assist you?",
  ];
  const subtitles = [
    "e.g. Full Stack Developer, Software Engineer, HR Executive.",
    "This helps the interviewer calibrate the difficulty of the questions.",
    "Choose technical, non-technical, a mix, or tell us something else.",
    `Add up to ${MAX_TOPICS} topics, e.g. React, HTML, CSS.`,
    `You can practice with anywhere from ${MIN_QUESTIONS} to ${MAX_QUESTIONS} questions.`,
    "Optional - we'll tailor questions to your background. You can skip this step.",
    "Optional - add any specific topic, focus area, or context for the interviewer.",
    "Controls how much the AI interviewer helps or explains when you struggle with a question.",
  ];

  return (
    <WizardShell
      step={step}
      totalSteps={TOTAL_STEPS}
      title={titles[step - 1]}
      subtitle={subtitles[step - 1]}
      footer={
        <>
          <button
            type="button"
            onClick={handleBack}
            disabled={step === 1}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-400 transition hover:text-slate-200 disabled:opacity-0"
          >
            Back
          </button>
          <div className="flex items-center gap-3">
            {step === 6 && isOnResumeChoiceScreen && (
              <button
                type="button"
                onClick={() => {
                  handleSkipResume();
                  handleNext();
                }}
                disabled={isParsingPdf}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-400 transition hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Skip
              </button>
            )}
            {step === 7 && (
              <button
                type="button"
                onClick={() => {
                  setAdditionalInfo("");
                  handleNext();
                }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-400 transition hover:text-slate-200"
              >
                Skip
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              disabled={!canGoNext || isSubmitting}
              className="rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
            >
              {step < TOTAL_STEPS ? "Continue" : isSubmitting ? "Creating..." : "Start setup"}
            </button>
          </div>
        </>
      }
    >
      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {step === 1 && prefill?.prefillJobTitle && (
        <div className="mb-4 rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-3 py-2 text-sm text-indigo-200">
          Pre-filled from your application{prefill.prefillCompany ? ` to ${prefill.prefillCompany}` : ""}. Feel free to
          adjust anything below.
        </div>
      )}

      {step === 1 && (
        <div>
          <input
            type="text"
            list="job-title-suggestions"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="Type or pick a job title"
            maxLength={100}
            className="w-full rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-indigo-400"
          />
          <datalist id="job-title-suggestions">
            {JOB_TITLE_SUGGESTIONS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <div className="mt-3 flex flex-wrap gap-2">
            {JOB_TITLE_SUGGESTIONS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setJobTitle(t)}
                className="rounded-full border border-slate-800 px-3 py-1 text-xs text-slate-400 hover:border-indigo-400 hover:text-indigo-300"
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-3">
          {ROLE_OPTIONS.map((opt) => (
            <OptionCard
              key={opt.value}
              label={opt.label}
              description={opt.description}
              selected={role === opt.value}
              onClick={() => setRole(opt.value)}
            />
          ))}
        </div>
      )}

      {step === 3 && (
        <div className="grid gap-3">
          {TYPE_OPTIONS.map((opt) => (
            <OptionCard
              key={opt.value}
              label={opt.label}
              description={opt.description}
              selected={typeOfInterview === opt.value}
              onClick={() => setTypeOfInterview(opt.value)}
            />
          ))}
          {typeOfInterview === "other" && (
            <input
              type="text"
              value={typeOfInterviewOther}
              onChange={(e) => setTypeOfInterviewOther(e.target.value)}
              placeholder="Describe the type of interview you want"
              maxLength={100}
              autoFocus
              className="w-full rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-indigo-400"
            />
          )}
        </div>
      )}

      {step === 4 && (
        <div>
          <TagInput
            tags={topics}
            onAdd={(t) => setTopics((prev) => (prev.length < MAX_TOPICS ? [...prev, t] : prev))}
            onRemove={(t) => setTopics((prev) => prev.filter((x) => x !== t))}
            placeholder="Type a topic and press Enter"
            suggestions={TOPIC_SUGGESTIONS}
          />
          <p className={`mt-2 text-xs ${topics.length > MAX_TOPICS ? "text-red-400" : "text-slate-500"}`}>
            {topics.length}/{MAX_TOPICS} topics
          </p>
        </div>
      )}

      {step === 5 && (
        <div className="flex flex-col items-center gap-6 py-4">
          <NumberStepper
            value={numberOfQuestions}
            onChange={setNumberOfQuestions}
            min={MIN_QUESTIONS}
            max={MAX_QUESTIONS}
          />
          <p className="text-xs text-slate-500">
            Questions to practice in this session ({MIN_QUESTIONS}-{MAX_QUESTIONS})
          </p>
        </div>
      )}

      {step === 6 && (
        <div>
          {isLoadingExistingResume && <p className="text-sm text-slate-500">Checking for a previous resume...</p>}

          {!isLoadingExistingResume && resumeMode === "existing" && existingResumeText && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <p className="text-sm font-medium text-slate-100">Using your previously uploaded resume</p>
              <div className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-950/40 p-3 text-xs text-slate-400">
                {resumeText}
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={handleEditResumeText}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:border-indigo-400 hover:text-indigo-300"
                >
                  Edit text
                </button>
                <button
                  type="button"
                  onClick={handleChangeResume}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:border-indigo-400 hover:text-indigo-300"
                >
                  Change resume
                </button>
              </div>
            </div>
          )}

          {!isLoadingExistingResume && resumeMode !== "existing" && resumeMode !== "upload" && resumeMode !== "text" && (
            <div className="grid gap-3">
              <label className="flex w-full cursor-pointer items-center justify-center rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-4 text-sm font-medium text-slate-100 transition hover:border-indigo-400 hover:text-indigo-300">
                {isParsingPdf ? "Reading PDF..." : "Upload resume (PDF)"}
                <input type="file" accept="application/pdf" onChange={handlePdfUpload} disabled={isParsingPdf} className="hidden" />
              </label>
              <button
                type="button"
                onClick={handleStartWritingResume}
                className="w-full rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-4 text-sm font-medium text-slate-100 transition hover:border-indigo-400 hover:text-indigo-300"
              >
                Write resume as text
              </button>
            </div>
          )}

          {resumeMode === "upload" && resumeText && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <p className="text-sm font-medium text-slate-100">Resume uploaded</p>
              <div className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-950/40 p-3 text-xs text-slate-400">
                {resumeText}
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={handleEditResumeText}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:border-indigo-400 hover:text-indigo-300"
                >
                  Edit text
                </button>
                <button
                  type="button"
                  onClick={handleChangeResume}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:border-indigo-400 hover:text-indigo-300"
                >
                  Change resume
                </button>
              </div>
            </div>
          )}

          {resumeMode === "text" && (
            <div className="relative">
              <button
                type="button"
                onClick={handleCloseResumeText}
                aria-label="Close"
                title="Close"
                className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-sm text-slate-300 hover:border-red-400 hover:text-red-300"
              >
                &times;
              </button>
              <textarea
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value.slice(0, 6000))}
                placeholder="Paste or type your resume content here"
                rows={8}
                autoFocus
                className="w-full rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-indigo-400"
              />
              <p className="mt-2 text-xs text-slate-500">{resumeText.length}/6000 characters</p>
            </div>
          )}

          {resumeError && <p className="mt-3 text-sm text-red-400">{resumeError}</p>}
        </div>
      )}

      {step === 7 && (
        <div>
          <textarea
            value={additionalInfo}
            onChange={(e) => setAdditionalInfo(e.target.value.slice(0, MAX_ADDITIONAL_INFO_LENGTH))}
            placeholder="e.g. Please focus more on React hooks, or ask about my experience leading a team..."
            rows={6}
            className="w-full rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-indigo-400"
          />
          <p className="mt-2 text-xs text-slate-500">
            {additionalInfo.length}/{MAX_ADDITIONAL_INFO_LENGTH} characters
          </p>
        </div>
      )}

      {step === 8 && <AssistanceSlider value={assistanceLevel} onChange={setAssistanceLevel} />}
    </WizardShell>
  );
}
