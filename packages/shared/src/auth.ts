/**
 * Authentication input rules shared by the dashboard (and later the capture app).
 * The password policy mirrors supabase/config.toml ([auth] minimum_password_length = 10,
 * password_requirements = "lower_upper_letters_digits"); Supabase Auth enforces it again
 * server-side. Messages are codes; UIs map them to localized text.
 */
import { z } from 'zod';

export const PASSWORD_POLICY = { minLength: 10, maxLength: 72 } as const;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ message: 'INVALID_EMAIL' }));

export const passwordSchema = z
  .string()
  .min(PASSWORD_POLICY.minLength, { message: 'PASSWORD_TOO_SHORT' })
  // bcrypt (used by Supabase Auth) ignores bytes beyond 72.
  .max(PASSWORD_POLICY.maxLength, { message: 'PASSWORD_TOO_LONG' })
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /[0-9]/.test(v), {
    message: 'PASSWORD_TOO_WEAK',
  });

export const signUpSchema = z.object({
  fullName: z.string().trim().min(1, { message: 'NAME_REQUIRED' }).max(120),
  email: emailSchema,
  password: passwordSchema,
});

export const signInSchema = z.object({
  email: emailSchema,
  // Do not reveal the policy on sign-in; just require something.
  password: z.string().min(1, { message: 'PASSWORD_REQUIRED' }).max(PASSWORD_POLICY.maxLength),
});

export const emailOnlySchema = z.object({ email: emailSchema });

export const newPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    message: 'PASSWORDS_DO_NOT_MATCH',
    path: ['confirm'],
  });

export type AuthFieldErrors = Partial<Record<string, string>>;

/** Flattens Zod issues into `{ field: code }` (first issue per field). */
export function fieldErrors(error: z.ZodError): AuthFieldErrors {
  const out: AuthFieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    out[key] ??= issue.message;
  }
  return out;
}

/**
 * Returns a same-origin relative path for post-auth redirects, or the fallback.
 * Blocks open redirects: absolute URLs, protocol-relative `//host`, backslash tricks,
 * control characters and paths outside the app.
 */
export function safeNextPath(value: string | null | undefined, fallback = '/app'): string {
  if (!value || value.length > 512) return fallback;
  // Reject control characters (incl. CR/LF/tab) and backslashes before any parsing.
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return fallback;
  }
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  try {
    const url = new URL(value, 'http://nookscanner.invalid');
    if (url.origin !== 'http://nookscanner.invalid') return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

/**
 * Maps Supabase Auth errors to codes without revealing whether an account exists
 * (threat T16: account enumeration).
 */
export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_CONFIRMED'
  | 'RATE_LIMITED'
  | 'WEAK_PASSWORD'
  | 'LINK_INVALID'
  | 'SAME_PASSWORD'
  | 'UNKNOWN';

export function mapAuthError(
  error: { code?: string; status?: number } | null | undefined,
): AuthErrorCode {
  if (!error) return 'UNKNOWN';
  switch (error.code) {
    case 'invalid_credentials':
    case 'user_not_found':
      return 'INVALID_CREDENTIALS';
    case 'email_not_confirmed':
      return 'EMAIL_NOT_CONFIRMED';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'RATE_LIMITED';
    case 'weak_password':
      return 'WEAK_PASSWORD';
    case 'otp_expired':
    case 'flow_state_expired':
    case 'flow_state_not_found':
    case 'bad_code_verifier':
      return 'LINK_INVALID';
    case 'same_password':
      return 'SAME_PASSWORD';
    default:
      return error.status === 429 ? 'RATE_LIMITED' : 'UNKNOWN';
  }
}
