/** English UI text for organization/member error codes (Arabic dashboard copy: later). */
const MESSAGES: Record<string, string> = {
  NAME_REQUIRED: 'Enter a name.',
  INVALID_EMAIL: 'Enter a valid email address.',
  ROLE_REQUIRED: 'Choose a role.',
  ADMIN_MUST_BE_ORG_WIDE: 'Admins always have access to the whole organization.',
  PROPERTIES_REQUIRED: 'Choose at least one property, or give access to the whole organization.',
  LAST_OWNER: 'An organization needs at least one owner. Make someone else owner first.',
  OWNER_ROLE_REQUIRED: 'Only an owner can grant or change the owner role.',
  FORBIDDEN: 'You do not have permission to do that.',
  CONFLICT: 'This person is already a member or already has an open invitation.',
  NOT_FOUND:
    'This invitation is invalid, expired, already used or was sent to a different email address.',
  UNAUTHENTICATED: 'Sign in again to continue.',
  UNKNOWN: 'Something went wrong. Try again.',
};

export function message(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return MESSAGES[code] ?? MESSAGES.UNKNOWN;
}

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  editor: 'Editor',
  viewer: 'Viewer',
};

export const ROLE_HINTS: Record<string, string> = {
  admin: 'Everything except deleting the organization',
  manager: 'Apartments, scans, publishing and QR codes',
  editor: 'Rooms, appliances and instructions',
  viewer: 'Read-only',
};
