/**
 * Stable error codes returned by APIs (docs/API_SPECIFICATION.md section 1).
 * Clients map codes to localized messages; internal details are never sent to clients.
 */
export const ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'RATE_LIMITED',
  'CONFLICT',
  'LAST_OWNER',
  'OWNER_ROLE_REQUIRED',
  'EXPERIENCE_NOT_FOUND',
  'UPLOAD_REJECTED',
  'POSE_ESTIMATION_FAILED',
  'INSUFFICIENT_COVERAGE',
  'VIDEO_TOO_DARK',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string };
}

export function isErrorCode(value: string): value is ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(value);
}
