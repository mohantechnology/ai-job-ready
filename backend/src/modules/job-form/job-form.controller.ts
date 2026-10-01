import { Body, Controller, HttpCode, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { ApiError } from "../../common/errors/api-error";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "../../common/auth/auth-user";
import { fillFormFields as fillFormFieldsOpenAI } from "../../services/jobbotOpenai.service";
import { fillFormFields as fillFormFieldsCursor } from "../../services/jobbotCursor.service";
import { resolveLlmFeature } from "../../llm/llmConfig.store";
import { INSTRUCTIONS } from "../../prompts/jobbotFillForm";

type FillFn = (
  pageHtml: string,
  profile: unknown,
  meta: unknown,
  options: {
    signal: AbortSignal;
    userId: string;
    onDelta: (chunk: { text: string; elapsedMs: number }) => void;
  }
) => Promise<{ answers: unknown; timing: unknown }>;

function parseFillBody(body: { pageHtml?: unknown; profile?: unknown; meta?: unknown }) {
  const { pageHtml, profile, meta } = body || {};

  console.log("pageHtml length", typeof pageHtml === "string" ? pageHtml.length : 0);
  if (typeof pageHtml !== "string" || pageHtml.trim().length === 0) {
    throw new ApiError(400, "`pageHtml` must be a non-empty string");
  }
  if (meta != null && (typeof meta !== "object" || Array.isArray(meta))) {
    throw new ApiError(400, "`meta` must be an object");
  }

  return { pageHtml, profile, meta };
}

function openFillStream(res: Response) {
  res.status(200);
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();
  res.socket?.setNoDelay?.(true);
}

function writeFillEvent(res: Response, event: unknown) {
  if (res.writableEnded) return;
  res.write(`${JSON.stringify(event)}\n`);
}

@Controller("api/form")
export class JobFormController {
  @Post("fill")
  @HttpCode(200)
  fillWithOpenAI(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: { pageHtml?: unknown; profile?: unknown; meta?: unknown }
  ) {
    return this.fillWithConfiguredProvider(req, res, body, user.id);
  }

  @Post("fill/cursor")
  @HttpCode(200)
  fillWithCursor(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: { pageHtml?: unknown; profile?: unknown; meta?: unknown }
  ) {
    return this.fillWithConfiguredProvider(req, res, body, user.id);
  }

  private async fillWithConfiguredProvider(
    req: Request,
    res: Response,
    body: { pageHtml?: unknown; profile?: unknown; meta?: unknown },
    userId: string
  ) {
    const cfg = await resolveLlmFeature("form_fill", INSTRUCTIONS);
    const fillFn = cfg.provider === "cursor" ? fillFormFieldsCursor : fillFormFieldsOpenAI;
    return this.handleFill(req, res, body, userId, fillFn, cfg.provider);
  }

  private async handleFill(
    req: Request,
    res: Response,
    body: { pageHtml?: unknown; profile?: unknown; meta?: unknown },
    userId: string,
    fillFn: FillFn,
    provider: string
  ) {
    const payload = parseFillBody(body);

    const abort = new AbortController();
    const onClientGone = () => {
      if (!res.writableEnded && !res.writableFinished) abort.abort();
    };
    res.on("close", onClientGone);
    req.on("aborted", onClientGone);

    try {
      openFillStream(res);
      writeFillEvent(res, { type: "start", provider });

      const result = await fillFn(payload.pageHtml, payload.profile, payload.meta, {
        signal: abort.signal,
        userId,
        onDelta: (chunk) => {
          writeFillEvent(res, {
            type: "delta",
            text: chunk.text,
            elapsedMs: chunk.elapsedMs,
          });
        },
      });

      writeFillEvent(res, {
        type: "done",
        answers: result.answers,
        timing: result.timing,
      });
      res.end();
    } catch (err) {
      console.error(`jobbot form/fill${provider === "cursor" ? "/cursor" : ""} failed:`, err);
      const message = `Failed to get a response from ${provider === "cursor" ? "Cursor" : "OpenAI"}`;
      const detail = err instanceof Error ? err.message : message;
      if (res.headersSent) {
        writeFillEvent(res, { type: "error", error: detail || message });
        if (!res.writableEnded) res.end();
        return;
      }
      throw new ApiError(502, message);
    } finally {
      res.off("close", onClientGone);
      req.off("aborted", onClientGone);
    }
  }
}
