export class AppError extends Error {
    statusCode;
    code;
    details;
    constructor(message, statusCode = 500, code = "INTERNAL_ERROR", details) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.name = "AppError";
    }
}
export class ValidationError extends AppError {
    constructor(message, details) {
        super(message, 422, "VALIDATION_ERROR", details);
        this.name = "ValidationError";
    }
}
export class NotFoundError extends AppError {
    constructor(resource) {
        super(`${resource} não encontrado`, 404, "NOT_FOUND");
        this.name = "NotFoundError";
    }
}
export class UnauthorizedError extends AppError {
    constructor(message = "Não autorizado") {
        super(message, 401, "UNAUTHORIZED");
        this.name = "UnauthorizedError";
    }
}
export class ForbiddenError extends AppError {
    constructor(message = "Acesso negado") {
        super(message, 403, "FORBIDDEN");
        this.name = "ForbiddenError";
    }
}
export class ConflictError extends AppError {
    constructor(message) {
        super(message, 409, "CONFLICT");
        this.name = "ConflictError";
    }
}
export class QuotaExceededError extends AppError {
    constructor(message = "Cota da API excedida. Tente novamente mais tarde.") {
        super(message, 429, "QUOTA_EXCEEDED");
        this.name = "QuotaExceededError";
    }
}
export function isAppError(error) {
    return error instanceof AppError;
}
export function toAppError(error) {
    if (isAppError(error))
        return error;
    if (error instanceof Error)
        return new AppError(error.message);
    return new AppError("Erro desconhecido");
}
