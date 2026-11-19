/** Active-organization selection (UI preference only; RLS remains the boundary). */
export const ACTIVE_ORG_COOKIE = 'ns_org';

export interface OrgSummary {
  id: string;
  name: string;
}

/** Picks the cookie's org when the user belongs to it, otherwise the first org by name. */
export function resolveActiveOrg(
  orgs: readonly OrgSummary[],
  cookieValue: string | undefined,
): OrgSummary | null {
  if (orgs.length === 0) return null;
  return orgs.find((o) => o.id === cookieValue) ?? orgs[0] ?? null;
}
