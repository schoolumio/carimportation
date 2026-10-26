export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "INVALID_TRANSITION"
  | "PRECONDITION_FAILED"
  | "RATE_LIMITED";

export class DomainError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const forbidden = (msg = "You are not allowed to perform this action.") => new DomainError("FORBIDDEN", msg);
export const notFound = (what = "Record") => new DomainError("NOT_FOUND", `${what} not found.`);
export const invalid = (msg: string, details?: unknown) => new DomainError("VALIDATION", msg, details);
export const conflict = (msg: string) => new DomainError("CONFLICT", msg);
export const precondition = (msg: string) => new DomainError("PRECONDITION_FAILED", msg);

export function isDomainError(e: unknown): e is DomainError {
  return e instanceof DomainError;
}
