/** Maps database/RPC error messages to stable codes (never echoes internal details). */
export function dbErrorCode(error: { message?: string; code?: string } | null): string {
  const m = `${error?.code ?? ''} ${error?.message ?? ''}`;
  for (const code of [
    'LAST_OWNER',
    'OWNER_ROLE_REQUIRED',
    'FORBIDDEN',
    'CONFLICT',
    'NOT_FOUND',
    'UNAUTHENTICATED',
    'UPLOAD_LIMIT_REACHED',
    'UPLOAD_REJECTED',
    'PART_INCOMPLETE',
    'NOT_READY',
    'NOTES_REQUIRED',
    'NOT_ALIGNED',
    'VALIDATION_FAILED',
  ]) {
    if (m.includes(code)) return code;
  }
  if (m.includes('23505')) return 'CONFLICT';
  if (m.includes('42501') || m.includes('row-level security')) return 'FORBIDDEN';
  return 'UNKNOWN';
}
