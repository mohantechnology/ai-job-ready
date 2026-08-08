import { ApiError } from "../middleware/errorHandler.js";
import { getInterview } from "../store/interviewStore.js";
import {
  createWhiteboardSubmission,
  getWhiteboardSubmissionImage,
} from "../repositories/whiteboardSubmissions.repository.js";

// Client-side compression already targets well under this, but the server
// enforces a hard ceiling too so a buggy/compromised client can't push an
// oversized blob into the database.
const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;
const DATA_URL_PATTERN = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/;

export async function createWhiteboardSubmissionHandler(req, res) {
  const interview = await getInterview(req.params.id, req.userId);
  if (!interview) {
    throw new ApiError(404, `Interview ${req.params.id} not found`);
  }

  const { imageDataUrl, questionOrderIndex } = req.body || {};
  const match = typeof imageDataUrl === "string" ? imageDataUrl.match(DATA_URL_PATTERN) : null;
  if (!match) {
    throw new ApiError(400, "imageDataUrl must be a base64 data URL (image/jpeg, image/png, or image/webp).");
  }

  const [, mimeType, base64] = match;
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new ApiError(413, `Whiteboard image is too large (${Math.round(buffer.length / 1024)}KB). Max is 2.5MB.`);
  }

  const submission = await createWhiteboardSubmission({
    interviewId: interview.id,
    questionOrderIndex: Number.isInteger(questionOrderIndex) ? questionOrderIndex : 0,
    mimeType,
    buffer,
  });

  res.status(201).json({ submission });
}

export async function getWhiteboardSubmissionImageHandler(req, res) {
  const interview = await getInterview(req.params.id, req.userId);
  if (!interview) {
    throw new ApiError(404, `Interview ${req.params.id} not found`);
  }

  const image = await getWhiteboardSubmissionImage(req.params.submissionId, interview.id);
  if (!image) {
    throw new ApiError(404, "Whiteboard submission not found");
  }

  res.setHeader("Content-Type", image.mimeType);
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.send(image.buffer);
}
