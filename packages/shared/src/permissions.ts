/**
 * Role -> permission matrix. Mirrors the `public.permissions` and `public.role_permissions`
 * seed in supabase/migrations/20261119000100_foundation.sql. The database is the enforcement
 * point (RLS); this copy drives UI decisions only. A database test asserts both are identical.
 * Spec: docs/DATABASE_SCHEMA.md section 4.4 (ADR-011).
 */

export const ORG_ROLES = ['owner', 'admin', 'manager', 'editor', 'viewer'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export type PermissionLevel = 'organization' | 'property';

export const PERMISSIONS = {
  'org.read': 'organization',
  'org.update': 'organization',
  'org.delete': 'organization',
  'member.read': 'organization',
  'member.manage': 'organization',
  'audit.read': 'organization',
  'property.create': 'organization',
  'property.read': 'property',
  'property.update': 'property',
  'property.delete': 'property',
  'apartment.read': 'property',
  'apartment.create': 'property',
  'apartment.update': 'property',
  'apartment.delete': 'property',
  'apartment.publish': 'property',
  'room.write': 'property',
  'scan.read': 'property',
  'scan.create': 'property',
  'scan.review': 'property',
  'appliance.write': 'property',
  'hotspot.write': 'property',
  'instruction.write': 'property',
  'instruction.verify': 'property',
  'qr.manage': 'property',
  'analytics.read': 'property',
} as const satisfies Record<string, PermissionLevel>;

export type Permission = keyof typeof PERMISSIONS;

const READ: Permission[] = [
  'org.read',
  'member.read',
  'property.read',
  'apartment.read',
  'scan.read',
  'analytics.read',
];
const EDIT: Permission[] = ['room.write', 'appliance.write', 'hotspot.write', 'instruction.write'];
const MANAGE: Permission[] = [
  'property.update',
  'apartment.create',
  'apartment.update',
  'apartment.publish',
  'scan.create',
  'scan.review',
  'instruction.verify',
  'qr.manage',
];
const ADMIN: Permission[] = [
  'org.update',
  'member.manage',
  'audit.read',
  'property.create',
  'property.delete',
  'apartment.delete',
];

export const ROLE_PERMISSIONS: Readonly<Record<OrgRole, ReadonlySet<Permission>>> = {
  viewer: new Set(READ),
  editor: new Set([...READ, ...EDIT]),
  manager: new Set([...READ, ...EDIT, ...MANAGE]),
  admin: new Set([...READ, ...EDIT, ...MANAGE, ...ADMIN]),
  owner: new Set([...READ, ...EDIT, ...MANAGE, ...ADMIN, 'org.delete']),
};

/** Roles that may be limited to specific properties (organization_members.scope = 'properties'). */
export const PROPERTY_SCOPABLE_ROLES: ReadonlySet<OrgRole> = new Set([
  'manager',
  'editor',
  'viewer',
]);

export function roleHasPermission(role: OrgRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

/** Rank used for display ordering and "at least" comparisons in the UI. */
export function roleRank(role: OrgRole): number {
  return ORG_ROLES.length - ORG_ROLES.indexOf(role);
}
