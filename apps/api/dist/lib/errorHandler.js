import { ZodError } from "zod";
import { isDev } from "../config/index.js";
import { isAppError, toAppError } from "./errors.js";
export function errorHandler(error, _req, res, _next) {
    const appError = isAppError(error) ? error : toAppError(error);
    if (error instanceof ZodError) {
        return res.status(422).json({
            error: "Erro de validação",
            code: "VALIDATION_ERROR",
            issues: error.flatten(),
        });
    }
    const statusCode = appError.statusCode;
    const response = {
        error: appError.message,
        code: appError.code,
    };
    if (appError.details)
        response.details = appError.details;
    if (isDev && error instanceof Error)
        response.stack = error.stack;
    res.status(statusCode).json(response);
}
