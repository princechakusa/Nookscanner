/** Organization and membership input rules (mirrors the DB checks in the foundation migration). */
import { z } from 'zod';
import { emailSchema } from './auth.ts';

export const ORG_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/;

/** URL-safe slug from a display name; Arabic/other scripts fall back to "org". */
export function slugify(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return base.length >= 3 ? base : `org-${base || 'new'}`.slice(0, 40).replace(/-+$/, '');
}

/** Adds a short random suffix (used after a slug conflict). */
export function withSuffix(slug: string, random = Math.random): string {
  const suffix = Math.floor(random() * 36 ** 4)
    .toString(36)
    .padStart(4, '0');
  return `${slug.slice(0, 43)}-${suffix}`;
}

export const createOrgSchema = z.object({
  name: z.string().trim().min(1, { message: 'NAME_REQUIRED' }).max(120),
});

export const INVITABLE_ROLES = ['admin', 'manager', 'editor', 'viewer'] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const inviteSchema = z
  .object({
    email: emailSchema,
    role: z.enum(INVITABLE_ROLES, { message: 'ROLE_REQUIRED' }),
    scope: z.enum(['organization', 'properties']).default('organization'),
    propertyIds: z.array(z.uuid()).max(200).default([]),
  })
  .refine((v) => v.scope === 'organization' || v.role !== 'admin', {
    message: 'ADMIN_MUST_BE_ORG_WIDE',
    path: ['scope'],
  })
  .refine((v) => (v.scope === 'properties') === v.propertyIds.length > 0, {
    message: 'PROPERTIES_REQUIRED',
    path: ['propertyIds'],
  });

export const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22,64}$/;
