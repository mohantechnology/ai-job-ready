-- Schema for the voice-bot AI interview app.
-- Run with: psql "$DATABASE_URL" -f backend/schema.sql
-- (or: PGPASSWORD=... psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f backend/schema.sql)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Cleanup of ad-hoc tables created while exploring the DB setup.
DROP TABLE IF EXISTS test;

-- ============================================================
-- users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- interviews
-- ============================================================
CREATE TABLE IF NOT EXISTS interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_title TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('junior', 'mid', 'senior')),
  type_of_interview TEXT NOT NULL CHECK (type_of_interview IN ('technical', 'non-technical', 'mix', 'other')),
  type_of_interview_other TEXT,
  topics JSONB NOT NULL DEFAULT '[]',
  number_of_questions INTEGER NOT NULL CHECK (number_of_questions BETWEEN 1 AND 29),
  resume_text TEXT,
  additional_info TEXT,
  assistance_level TEXT NOT NULL DEFAULT 'on_request' CHECK (assistance_level IN ('always', 'on_request', 'never')),
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'in_progress', 'completed')),
  ended_reason TEXT,
  transcript JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Older installs may still have the JSONB summary column from before summaries
-- were moved into their own table (see interview_summary below).
ALTER TABLE interviews DROP COLUMN IF EXISTS summary;

-- Older installs: add new interview-setup fields (job title, "other" interview
-- type, resume text, additional free-form info) introduced when the setup
-- wizard grew a job-title step, a custom interview-type option, an optional
-- resume step, and an optional additional-info step.
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS job_title TEXT NOT NULL DEFAULT '';
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS type_of_interview_other TEXT;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS resume_text TEXT;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS additional_info TEXT;

-- Older installs: add the AI-agent-behaviour ("assistance level") field
-- introduced when the setup wizard grew a final step letting the candidate
-- control how much the interviewer helps when they get stuck:
--   'always'     - interviewer proactively assists when the candidate's answer is wrong
--   'on_request' - interviewer only assists/explains when the candidate explicitly asks for it
--   'never'      - interviewer never assists or explains, just moves on
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS assistance_level TEXT NOT NULL DEFAULT 'on_request';
ALTER TABLE interviews DROP CONSTRAINT IF EXISTS interviews_assistance_level_check;
ALTER TABLE interviews ADD CONSTRAINT interviews_assistance_level_check
  CHECK (assistance_level IN ('always', 'on_request', 'never'));

-- Widen the type_of_interview / number_of_questions checks to match the new
-- allowed values/ranges (drop-and-recreate since Postgres has no ALTER CHECK).
ALTER TABLE interviews DROP CONSTRAINT IF EXISTS interviews_type_of_interview_check;
ALTER TABLE interviews ADD CONSTRAINT interviews_type_of_interview_check
  CHECK (type_of_interview IN ('technical', 'non-technical', 'mix', 'other'));

ALTER TABLE interviews DROP CONSTRAINT IF EXISTS interviews_number_of_questions_check;
ALTER TABLE interviews ADD CONSTRAINT interviews_number_of_questions_check
  CHECK (number_of_questions BETWEEN 1 AND 29);

CREATE INDEX IF NOT EXISTS idx_interviews_user_id ON interviews(user_id);
CREATE INDEX IF NOT EXISTS idx_interviews_created_at ON interviews(created_at DESC);

-- ============================================================
-- topics
-- Coarse subject areas (e.g. "javascript", "css"), chosen by the user when
-- creating an interview. Looked up/created on the fly from whatever the
-- question-generation LLM outputs - no fixed enum.
-- ============================================================
CREATE TABLE IF NOT EXISTS topics (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

-- ============================================================
-- concepts
-- Fine-grained subtopics within a topic (e.g. "event-loop", "box-model").
-- Scoped to a topic (unique per topic, not globally) since the same concept
-- name could plausibly mean different things under different topics.
-- Looked up/created on the fly, same as topics - no fixed taxonomy.
-- ============================================================
CREATE TABLE IF NOT EXISTS concepts (
  id SERIAL PRIMARY KEY,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  UNIQUE (topic_id, name)
);

-- ============================================================
-- interview_questions
-- Questions generated by the LLM ahead of time for a given interview,
-- so the realtime interviewer asks a fixed, pre-planned question list
-- instead of improvising questions on the fly. score/answer/feedback are
-- filled in after grading (see interview_summary + scoring.service.js).
-- topic/concept are tracked via topics/concepts so past performance can be
-- looked up per-concept when generating future interviews for the same user
-- (see taxonomy.repository.js + questionGeneration.service.js).
-- ============================================================
CREATE TABLE IF NOT EXISTS interview_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  topic_id INTEGER REFERENCES topics(id),
  concept_id INTEGER REFERENCES concepts(id),
  answer TEXT,
  score INTEGER,
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (interview_id, order_index)
);

ALTER TABLE interview_questions DROP COLUMN IF EXISTS topic;
ALTER TABLE interview_questions ADD COLUMN IF NOT EXISTS topic_id INTEGER REFERENCES topics(id);
ALTER TABLE interview_questions ADD COLUMN IF NOT EXISTS concept_id INTEGER REFERENCES concepts(id);
ALTER TABLE interview_questions ADD COLUMN IF NOT EXISTS answer TEXT;
ALTER TABLE interview_questions ADD COLUMN IF NOT EXISTS score INTEGER;
ALTER TABLE interview_questions ADD COLUMN IF NOT EXISTS feedback TEXT;

CREATE INDEX IF NOT EXISTS idx_interview_questions_interview_id ON interview_questions(interview_id);
CREATE INDEX IF NOT EXISTS idx_interview_questions_concept_id ON interview_questions(concept_id);

-- ============================================================
-- interview_summary
-- One row per graded interview, holding the overall/aggregate grading
-- result. Per-question score/answer/feedback live on interview_questions
-- instead. interviews.summary_id points here.
-- ============================================================
CREATE TABLE IF NOT EXISTS interview_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  overall_score INTEGER,
  overall_feedback TEXT,
  strengths JSONB NOT NULL DEFAULT '[]',
  improvements JSONB NOT NULL DEFAULT '[]',
  topics JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interview_summary_interview_id ON interview_summary(interview_id);

ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS summary_id UUID REFERENCES interview_summary(id) ON DELETE SET NULL;

-- ============================================================
-- whiteboard_submissions
-- Compressed JPEG snapshots of the candidate's whiteboard (Excalidraw)
-- drawings (schemas/system-design/diagrams) submitted during an interview.
-- Stored as bytea (kept under ~2MB by client-side compression before
-- upload) so they can be re-viewed later from the Results page. Mirrors
-- the question_order_index convention used for text/code submissions in
-- the transcript, so a submission can be matched back to the question
-- that was active when it was sent.
-- ============================================================
CREATE TABLE IF NOT EXISTS whiteboard_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  question_order_index INTEGER NOT NULL DEFAULT 0,
  mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
  size_bytes INTEGER NOT NULL,
  image_data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whiteboard_submissions_interview_id ON whiteboard_submissions(interview_id);

-- ============================================================
-- user_profile
-- Job-bot autofill candidate profile, merged in from the standalone
-- job-bot/backend service (see src/repositories/userProfile.repository.js).
-- One row per account (`user_id` → `users.id`). `details` is the canonical
-- profile; `new_details` are facts the candidate later confirmed on real
-- forms (same shape as the old flat-file userdetails.json this replaces).
-- ============================================================
CREATE TABLE IF NOT EXISTS user_profile (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  details JSONB NOT NULL DEFAULT '[]',
  new_details JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Existing installs created this table before per-user auth existed.
ALTER TABLE user_profile
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Seed the single row (id = 1) this table uses today, carrying over the
-- real data that used to live in job-bot/backend/src/data/userdetails.json.
-- No-op on installs that already have this row.
INSERT INTO user_profile (id, details, new_details)
SELECT 1,
$$[
  {"label": "First name", "key": "firstName", "answer": [{"value": "Mohan"}]},
  {"label": "Middle name", "key": "middleName", "answer": [{"value": "raj"}]},
  {"label": "Last name", "key": "lastName", "answer": [{"value": "khanna"}]},
  {"label": "Email", "key": "email", "answer": [{"value": "mohan@gm.com"}]},
  {"label": "Phone", "key": "phone", "answer": [{"value": "+91-9840000000"}]},
  {"label": "Location", "key": "location", "answer": [{"value": "Bangalore, Karnataka, India"}]},
  {"label": "LinkedIn URL", "key": "linkedinUrl", "answer": [{"value": "https://linkedin.com/in/mohan-kannan-0000000000"}]},
  {"label": "GitHub Profile", "key": "githubProfile", "answer": [{"value": "https://github.com/mohan-kannan"}]},
  {"label": "Portfolio", "key": "portfolio", "answer": [{"value": "https://mohan-kannan.dev"}]},
  {"label": "Current title", "key": "currentTitle", "answer": [{"value": "Full Stack Developer"}]},
  {"label": "Years of experience", "key": "yearsOfExperience", "answer": [{"value": "3"}]},
  {"label": "Desired position", "key": "desiredPosition", "answer": [{"value": "Software Engineer"}]},
  {"label": "Available start date", "key": "availableStartDate", "answer": [{"value": "Immediate"}]},
  {"label": "Expected salary", "key": "expectedSalary", "answer": [{"value": "Negotiable"}]},
  {"label": "Work authorization", "key": "workAuthorization", "answer": [{"value": "Authorized to work in the India"}]},
  {"label": "Requires sponsorship", "key": "requiresSponsorship", "answer": [{"value": "No"}]},
  {"label": "Education", "key": "education", "answer": [{"value": "B.Tech in Computer Science, CSVTU, 2023"}]},
  {"label": "Degree", "key": "degree", "answer": [{"value": "B.Tech in Computer Science"}]},
  {"label": "School", "key": "school", "answer": [{"value": "CSVTU"}]},
  {"label": "Graduation year", "key": "graduationYear", "answer": [{"value": "2023"}]},
  {"label": "Skills", "key": "skills", "answer": [{"value": "JavaScript"}, {"value": "TypeScript"}, {"value": "React"}, {"value": "Node.js"}, {"value": "Python"}, {"value": "SQL"}]},
  {"label": "Gender identity", "key": "genderIdentity", "answer": [{"value": "Male"}]},
  {"label": "Race", "key": "race", "answer": [{"value": "Asian"}]},
  {"label": "Ethnicity", "key": "ethnicity", "answer": [{"value": "Indian"}]},
  {"label": "Disability", "key": "disability", "answer": [{"value": "No"}]},
  {"label": "Veteran status", "key": "veteranStatus", "answer": [{"value": "No"}]},
  {"label": "Summary", "key": "summary", "answer": [{"value": "Full-stack engineer with 4+ years of experience building and shipping web applications end-to-end, from React frontends to Node.js APIs."}]},
  {"label": "Cover letter", "key": "coverLetterTemplate", "answer": [{"value": "I'm excited to apply for this role because it lines up closely with my background in full-stack web development. I'd welcome the chance to bring that experience to your team."}]}
]$$::jsonb,
$$[
  {"label": "Hide jobs which require me to apply on the company's website", "key": "hideJobsWhichRequireMeToApplyOn", "answer": [{"value": "No"}]}
]$$::jsonb
WHERE NOT EXISTS (SELECT 1 FROM user_profile WHERE id = 1);

-- Attach the legacy single-row profile (id = 1) to the oldest account so
-- existing autofill data is not orphaned after the per-user switch.
UPDATE user_profile
SET user_id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1)
WHERE id = 1
  AND user_id IS NULL
  AND EXISTS (SELECT 1 FROM users);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profile_user_id ON user_profile (user_id);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $trigger$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$trigger$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_profile_set_updated_at ON user_profile;
CREATE TRIGGER user_profile_set_updated_at
BEFORE UPDATE ON user_profile
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- session
-- Backing store for express-session (via connect-pg-simple), so login
-- sessions survive a backend restart instead of living only in memory.
-- Table shape follows connect-pg-simple's expected schema.
-- ============================================================
CREATE TABLE IF NOT EXISTS session (
  sid VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_expire ON session(expire);

-- ============================================================
-- applied_jobs
-- One row per saved job posting. The extension sends the page HTML;
-- an LLM (Cursor or OpenAI, chosen by JOB_EXTRACT_PROVIDER) extracts
-- the fields shown on the Applied jobs page. Saving the same URL again
-- refreshes those fields and keeps status plus any practice interviews.
-- page_html is the stripped page that extraction actually read.
-- ============================================================
CREATE TABLE IF NOT EXISTS applied_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  source_key TEXT NOT NULL,
  page_title TEXT NOT NULL DEFAULT '',
  page_html TEXT NOT NULL DEFAULT '',
  page_meta JSONB NOT NULL DEFAULT '{}',
  company TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL DEFAULT 'mid' CHECK (level IN ('junior', 'mid', 'senior')),
  location TEXT NOT NULL DEFAULT '',
  work_mode TEXT NOT NULL DEFAULT '',
  salary TEXT NOT NULL DEFAULT '',
  topics JSONB NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'interviewed', 'offered', 'rejected')),
  extraction JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_applied_jobs_user_source_key ON applied_jobs (user_id, source_key);
CREATE INDEX IF NOT EXISTS idx_applied_jobs_user_created ON applied_jobs (user_id, created_at DESC);

DROP TRIGGER IF EXISTS applied_jobs_set_updated_at ON applied_jobs;
CREATE TRIGGER applied_jobs_set_updated_at
BEFORE UPDATE ON applied_jobs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Practice interviews created from an applied job. Several interviews
-- can point at the same job. Deleting the job keeps the interviews.
ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS applied_job_id UUID REFERENCES applied_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_interviews_applied_job_id ON interviews (applied_job_id);

-- ============================================================
-- llm_usage_events
-- One row per LLM call made for an account (form fill, job extract,
-- voice interview turns, and the rest). Token counts come from the
-- provider response. Prompts and page HTML are not stored.
-- api_key_provider records which API key served the call (cursor,
-- openai, or other). It is for the admin panel and is not returned
-- by the user usage API.
-- ============================================================
CREATE TABLE IF NOT EXISTS llm_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'cursor')),
  api_key_provider TEXT NOT NULL CHECK (api_key_provider IN ('openai', 'cursor', 'other')),
  model TEXT NOT NULL DEFAULT '',
  feature TEXT NOT NULL CHECK (feature IN (
    'form_fill',
    'job_extract',
    'job_summary',
    'resume_prefill',
    'job_research',
    'question_generation',
    'interview_grading',
    'realtime_interview'
  )),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'cancelled')),
  service_tier TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  cached_input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens INTEGER NOT NULL DEFAULT 0,
  audio_input_tokens INTEGER NOT NULL DEFAULT 0,
  audio_output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  ttfb_ms INTEGER,
  error_message TEXT,
  meta JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_events_user_created
  ON llm_usage_events (user_id, created_at DESC);

-- ============================================================
-- llm_feature_settings
-- Per-feature overrides for the admin "Manage models" screen.
-- A NULL column means "use the built-in default" (hardcoded prompt,
-- env model, or env API key). The backend keeps these rows in memory
-- and refreshes that cache on save, so a prompt change applies on the
-- next LLM call without a process restart.
-- ============================================================
CREATE TABLE IF NOT EXISTS llm_feature_settings (
  feature_key TEXT PRIMARY KEY,
  display_name TEXT,
  provider TEXT CHECK (provider IS NULL OR provider IN ('openai', 'cursor')),
  model TEXT,
  api_key TEXT,
  system_prompt TEXT,
  fast_mode BOOLEAN,
  reasoning_effort TEXT,
  max_tokens INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS llm_feature_settings_set_updated_at ON llm_feature_settings;
CREATE TRIGGER llm_feature_settings_set_updated_at
BEFORE UPDATE ON llm_feature_settings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
