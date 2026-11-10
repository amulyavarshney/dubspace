export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "STALE_REVISION"
  | "INVALID_STATE"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  | "PROVIDER_NOT_CONFIGURED"
  | "PROVIDER_ERROR"
  | "QUOTA_EXCEEDED"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ApiErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static unauthenticated(msg = "Authentication required") {
    return new ApiError(401, "UNAUTHENTICATED", msg);
  }
  static forbidden(msg = "You do not have permission to perform this action") {
    return new ApiError(403, "FORBIDDEN", msg);
  }
  static notFound(msg = "Resource not found") {
    return new ApiError(404, "NOT_FOUND", msg);
  }
  static validation(msg = "Invalid request", details?: unknown) {
    return new ApiError(400, "VALIDATION_ERROR", msg, details);
  }
  static conflict(msg: string, details?: unknown) {
    return new ApiError(409, "CONFLICT", msg, details);
  }
  static stale(msg = "The resource was modified by someone else. Reload and try again.") {
    return new ApiError(409, "STALE_REVISION", msg);
  }
  static invalidState(msg: string) {
    return new ApiError(409, "INVALID_STATE", msg);
  }
  static rateLimited(msg = "Too many requests. Please slow down.") {
    return new ApiError(429, "RATE_LIMITED", msg);
  }
}
