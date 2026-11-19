import { describe, expect, it } from 'vitest';
import { ORG_ROLES, PERMISSIONS, ROLE_PERMISSIONS, roleHasPermission } from './permissions.ts';

describe('permission matrix', () => {
  it('is strictly cumulative: each role includes every permission of the role below it', () => {
    for (let i = 0; i < ORG_ROLES.length - 1; i++) {
      const higher = ROLE_PERMISSIONS[ORG_ROLES[i]!];
      const lower = ROLE_PERMISSIONS[ORG_ROLES[i + 1]!];
      for (const p of lower) expect(higher.has(p), `${ORG_ROLES[i]} should have ${p}`).toBe(true);
    }
  });

  it('only references known permissions', () => {
    for (const role of ORG_ROLES) {
      for (const p of ROLE_PERMISSIONS[role]) expect(Object.keys(PERMISSIONS)).toContain(p);
    }
  });

  it('enforces key product boundaries', () => {
    expect(roleHasPermission('viewer', 'apartment.update')).toBe(false);
    expect(roleHasPermission('editor', 'hotspot.write')).toBe(true);
    expect(roleHasPermission('editor', 'apartment.publish')).toBe(false);
    expect(roleHasPermission('manager', 'apartment.publish')).toBe(true);
    expect(roleHasPermission('manager', 'member.manage')).toBe(false);
    expect(roleHasPermission('admin', 'org.delete')).toBe(false);
    expect(roleHasPermission('owner', 'org.delete')).toBe(true);
  });
});
