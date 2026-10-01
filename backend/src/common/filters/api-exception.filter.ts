import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import type { Response } from "express";

// The React client and the job-bot extension both read `error.message`
// (and a string `error` as a fallback). Keep that body instead of Nest's
// default `{ statusCode, message, error }`.
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) return;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Internal server error";
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === "string") {
        message = body;
      } else if (body && typeof body === "object") {
        const record = body as { message?: unknown; details?: unknown };
        if (Array.isArray(record.message)) {
          message = record.message.join(", ");
        } else if (typeof record.message === "string") {
          message = record.message;
        }
        details = record.details;
      }
    } else if (exception instanceof Error && exception.message) {
      message = exception.message;
    }

    if (status >= 500) {
      console.error(exception);
    }

    res.status(status).json({
      error: {
        message,
        ...(details !== undefined ? { details } : {}),
      },
    });
  }
}
