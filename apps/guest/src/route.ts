/**
 * Guest entry route: QR codes encode https://<guest-host>/a/<token> (ADR-012).
 * Tokens are 128-bit+ random base64url strings; anything else is rejected before any request.
 */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22,64}$/;

export function parseGuestToken(pathname: string): string | null {
  const match = /^\/a\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  const token = match[1]!;
  return TOKEN_PATTERN.test(token) ? token : null;
}
