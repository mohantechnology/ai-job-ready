import { readFileSync } from "fs";
import { join } from "path";
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "../../common/auth/auth-user";
import {
  deleteCanonicalDetail,
  getUserDetails,
  saveAdditionalAnswer,
  saveCanonicalDetails,
  saveNewDetails,
} from "../../repositories/userProfile.repository";
import { extractProfileFromResume } from "../../services/profileFromResume.service";

const USER_DETAILS_SCHEMA_PATH = join(__dirname, "../../jsonData/userDetails.json");

function parseFieldsBody(body) {
  if (Array.isArray(body?.fields)) return body.fields;
  if (Array.isArray(body?.newDetails)) return body.newDetails;
  if (body && typeof body === "object" && (body.label || body.key)) return [body];
  return null;
}

@Controller("api/user")
export class ProfileController {
  @Post("save-details")
  @HttpCode(200)
  async saveDetails(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const fields = parseFieldsBody(body || {});
    if (!fields) {
      throw new ApiError(400, "`fields` must be an array of { label, key, answer } objects");
    }

    try {
      const updated = await saveNewDetails(user.id, fields);
      return { ok: true, newDetails: updated.newDetails };
    } catch (err) {
      console.error("jobbot user/save-details failed:", err);
      const message = err instanceof Error ? err.message : "Failed to save details";
      throw new ApiError(400, message);
    }
  }

  @Post("save-answer")
  @HttpCode(200)
  async saveAnswer(@CurrentUser() user: AuthUser, @Body() body: { label?: unknown; value?: unknown }) {
    const { label, value } = body || {};

    if (typeof label !== "string" || typeof value !== "string" || !label.trim() || !value.trim()) {
      throw new ApiError(400, "`label` and `value` must be non-empty strings");
    }

    try {
      await saveAdditionalAnswer(user.id, label, value);
      return { ok: true };
    } catch (err) {
      console.error("jobbot user/save-answer failed:", err);
      throw new ApiError(500, "Failed to save the answer");
    }
  }

  @Get("profile-fields")
  getProfileFields() {
    try {
      const schema = JSON.parse(readFileSync(USER_DETAILS_SCHEMA_PATH, "utf8"));
      return {
        details: Array.isArray(schema?.details) ? schema.details : [],
        extraDetails: Array.isArray(schema?.extraDetails) ? schema.extraDetails : [],
      };
    } catch (err) {
      console.error("jobbot user/profile-fields GET failed:", err);
      throw new ApiError(500, "Failed to load profile fields");
    }
  }

  @Get("profile")
  async getProfile(@CurrentUser() user: AuthUser) {
    try {
      const { details, newDetails } = await getUserDetails(user.id);
      return { details, newDetails };
    } catch (err) {
      console.error("jobbot user/profile GET failed:", err);
      throw new ApiError(500, "Failed to load profile");
    }
  }

  @Post("profile-from-resume")
  @HttpCode(200)
  async prefillFromResume(@CurrentUser() user: AuthUser, @Body() body: { resumeText?: unknown }) {
    const resumeText = typeof body?.resumeText === "string" ? body.resumeText.trim() : "";
    if (!resumeText) {
      throw new ApiError(400, "Upload a resume before filling the form.");
    }
    if (resumeText.length > 20000) {
      throw new ApiError(400, "That resume is too long to read. Try a shorter PDF.");
    }

    try {
      const result = await extractProfileFromResume(resumeText, user.id);
      return { ok: true, values: result.values, filledCount: result.filledCount };
    } catch (err) {
      console.error("jobbot user/profile-from-resume failed:", err);
      const message = err instanceof Error ? err.message : "Failed to read the resume";
      const status = /not configured|not set/i.test(message) ? 503 : 502;
      throw new ApiError(status, message);
    }
  }

  @Put("profile")
  async updateProfile(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const fields = parseFieldsBody(body || {});
    if (!fields) {
      throw new ApiError(400, "`fields` must be an array of { label, key, answer } objects");
    }

    try {
      const updated = await saveCanonicalDetails(user.id, fields);
      return { ok: true, details: updated.details };
    } catch (err) {
      console.error("jobbot user/profile PUT failed:", err);
      const message = err instanceof Error ? err.message : "Failed to update profile";
      throw new ApiError(400, message);
    }
  }

  @Delete("profile/:key")
  async deleteProfileField(@CurrentUser() user: AuthUser, @Param("key") key: string) {
    try {
      const updated = await deleteCanonicalDetail(user.id, key);
      return { ok: true, details: updated.details };
    } catch (err) {
      console.error("jobbot user/profile DELETE failed:", err);
      const message = err instanceof Error ? err.message : "Failed to delete profile field";
      throw new ApiError(400, message);
    }
  }
}
