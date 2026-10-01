import { HttpException } from "@nestjs/common";

export class ApiError extends HttpException {
  readonly details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super({ message, details }, statusCode);
    this.details = details;
  }
}
