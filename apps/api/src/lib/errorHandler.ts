import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { isDev } from "../config/index.js";
import { AppError, isAppError, toAppError } from "./errors.js";

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  const appError = isAppError(error) ? error : toAppError(error);

  if (error instanceof ZodError) {
    return res.status(422).json({
      error: "Erro de validação",
      code: "VALIDATION_ERROR",
      issues: error.flatten(),
    });
  }

  const statusCode = appError.statusCode;
  const response: Record<string, unknown> = {
    error: appError.message,
    code: appError.code,
  };

  if (appError.details) response.details = appError.details;
  if (isDev && error instanceof Error) response.stack = error.stack;

  res.status(statusCode).json(response);
}