/** English UI text for auth codes (Arabic dashboard copy arrives with i18n in Phase 3). */
const MESSAGES: Record<string, string> = {
  INVALID_EMAIL: 'Enter a valid email address.',
  PASSWORD_REQUIRED: 'Enter your password.',
  PASSWORD_TOO_SHORT: 'Use at least 10 characters.',
  PASSWORD_TOO_LONG: 'Use at most 72 characters.',
  PASSWORD_TOO_WEAK: 'Use upper- and lower-case letters and at least one digit.',
  PASSWORDS_DO_NOT_MATCH: 'The passwords do not match.',
  NAME_REQUIRED: 'Enter your name.',
  INVALID_CREDENTIALS: 'Email or password is incorrect.',
  EMAIL_NOT_CONFIRMED: 'Confirm your email address first. Check your inbox for the link.',
  RATE_LIMITED: 'Too many attempts. Wait a few minutes and try again.',
  WEAK_PASSWORD: 'This password is too weak or has appeared in a data breach. Choose another.',
  LINK_INVALID: 'This link is invalid or has expired. Request a new one.',
  SAME_PASSWORD: 'Choose a password you have not used for this account.',
  UNKNOWN: 'Something went wrong. Try again.',
};

export function authMessage(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return MESSAGES[code] ?? MESSAGES.UNKNOWN;
}
