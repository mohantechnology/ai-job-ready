const BASE_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");
const TOKEN_KEY = "voicebot_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function request(path, options = {}) {
  const token = getToken();
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await response.json() : null;

  if (!response.ok) {
    const message = body?.error?.message || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return body;
}

export function register({ name, email, password }) {
  return request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
}

export function login({ email, password }) {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function logout() {
  return request("/auth/logout", { method: "POST" });
}

export function getMe() {
  return request("/auth/me");
}

export function createInterview(payload) {
  return request("/interviews", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getInterview(id) {
  return request(`/interviews/${id}`);
}

export function listInterviews() {
  return request("/interviews");
}

// Learning progress aggregated across completed interviews.
// range: this_week | last_week | this_month | last_month | all
export function getProgress(range = "this_week") {
  const params = new URLSearchParams({ range });
  return request(`/progress?${params}`);
}

export function getLatestResume() {
  return request("/interviews/resume/latest");
}

export function createRealtimeToken(interviewId) {
  return request("/realtime/token", {
    method: "POST",
    body: JSON.stringify({ interviewId }),
  });
}

export function completeInterview({ interviewId, transcript, endedReason }) {
  return request("/webhook/interview-complete", {
    method: "POST",
    body: JSON.stringify({ interviewId, transcript, endedReason }),
  });
}

// Persists a compressed whiteboard drawing (base64 JPEG data URL) to the DB
// so it can be viewed again later from the Results page. Separate from
// sending it to the voice model, which happens directly over the realtime
// data channel (see useRealtimeInterview.js's submitWhiteboard).
export function uploadWhiteboardSubmission(interviewId, imageDataUrl, questionOrderIndex) {
  return request(`/interviews/${interviewId}/whiteboard`, {
    method: "POST",
    body: JSON.stringify({ imageDataUrl, questionOrderIndex }),
  });
}

// Returns an object URL for a stored whiteboard image - caller is
// responsible for revoking it (URL.revokeObjectURL) when no longer needed.
export async function getWhiteboardSubmissionImageUrl(interviewId, submissionId) {
  const token = getToken();
  const response = await fetch(`${BASE_URL}/interviews/${interviewId}/whiteboard/${submissionId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new Error(`Failed to load whiteboard image (${response.status})`);
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
