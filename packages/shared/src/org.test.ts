import { describe, expect, it } from 'vitest';
import { ORG_SLUG_PATTERN, inviteSchema, slugify, withSuffix } from './org.ts';

describe('slugify', () => {
  it.each([
    ['Marina Heights Rentals', 'marina-heights-rentals'],
    ['  Café Résidences!! ', 'cafe-residences'],
    ['شقق الخليج', 'org-new'],
    ['AB', 'org-ab'],
  ])('%s -> %s', (name, slug) => {
    expect(slugify(name)).toBe(slug);
    expect(slugify(name)).toMatch(ORG_SLUG_PATTERN);
  });

  it('stays valid for long names and with a suffix', () => {
    const long = slugify('x'.repeat(200));
    expect(long).toMatch(ORG_SLUG_PATTERN);
    expect(withSuffix(long, () => 0.5)).toMatch(ORG_SLUG_PATTERN);
  });
});

describe('inviteSchema', () => {
  it('normalises email and defaults to organization scope', () => {
    expect(inviteSchema.parse({ email: ' A@B.co ', role: 'editor' })).toEqual({
      email: 'a@b.co',
      role: 'editor',
      scope: 'organization',
      propertyIds: [],
    });
  });

  it('never allows inviting an owner, scoped admins, or scope without properties', () => {
    expect(inviteSchema.safeParse({ email: 'a@b.co', role: 'owner' }).success).toBe(false);
    const scopedAdmin = inviteSchema.safeParse({
      email: 'a@b.co',
      role: 'admin',
      scope: 'properties',
      propertyIds: ['8a6e0804-2bd0-4672-b79d-d97027f9071a'],
    });
    expect(scopedAdmin.error?.issues[0]?.message).toBe('ADMIN_MUST_BE_ORG_WIDE');
    const noProps = inviteSchema.safeParse({
      email: 'a@b.co',
      role: 'viewer',
      scope: 'properties',
    });
    expect(noProps.error?.issues[0]?.message).toBe('PROPERTIES_REQUIRED');
  });
});
