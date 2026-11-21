/**
 * Guest experience payload (what the `guest-experience` Edge Function returns for a QR token,
 * docs/API_SPECIFICATION.md). Validated on the client before rendering so a malformed or
 * tampered response can never reach the UI. Strings are plain text (never HTML).
 */
import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);
export const localizedSchema = z.object({ en: text(200), ar: text(200).optional() });
export type Localized = z.infer<typeof localizedSchema>;

export const ROOM_TYPES = [
  'entrance',
  'living',
  'kitchen',
  'dining',
  'bedroom',
  'bathroom',
  'hallway',
  'balcony',
  'laundry',
  'office',
  'storage',
  'other',
] as const;

const httpsUrl = z
  .url()
  .refine((u) => u.startsWith('https://') || u.startsWith('/'), { message: 'https only' });

export const guestStepSchema = z.object({ text: localizedSchema });
export const guestTroubleSchema = z.object({
  problem: localizedSchema,
  solution: localizedSchema,
});

export const guestApplianceSchema = z.object({
  id: z.string().min(1).max(64),
  roomId: z.string().min(1).max(64),
  category: z.string().regex(/^[a-z_]{2,40}$/),
  name: localizedSchema,
  aliases: z.object({ en: z.array(text(60)).max(20), ar: z.array(text(60)).max(20) }),
  brand: text(60).optional(),
  model: text(60).optional(),
  verified: z.boolean(),
  steps: z.array(guestStepSchema).max(30),
  troubleshooting: z.array(guestTroubleSchema).max(20),
  video: z
    .object({
      url: httpsUrl,
      posterUrl: httpsUrl.optional(),
      durationSec: z.number().int().min(1).max(3600),
    })
    .optional(),
});

export const guestRoomSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(ROOM_TYPES),
  name: localizedSchema,
});

const vec3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);

export const guestExperienceSchema = z.object({
  apartment: z.object({ name: localizedSchema, property: localizedSchema.optional() }),
  rooms: z.array(guestRoomSchema).min(1).max(40),
  appliances: z.array(guestApplianceSchema).max(300),
  support: z.object({
    phone: z
      .string()
      .regex(/^\+?[0-9 ()-]{6,24}$/)
      .optional(),
    whatsapp: z
      .string()
      .regex(/^\+?[0-9]{6,20}$/)
      .optional(),
    email: z.email().optional(),
  }),
  /** Scene assets arrive in Phase 7/9; absent means the 3D view is not published yet. */
  scene: z
    .object({
      url: httpsUrl,
      sizeBytes: z.number().int().positive(),
      /** Apartment box after alignment (metres, Y up): camera limits (viewer constraints.ts). */
      bounds: z.object({ min: vec3, max: vec3 }).optional(),
      /** Starting view (usually the entrance viewpoint). */
      start: z.object({ position: vec3, target: vec3 }).optional(),
      /** Scene -> metres matrix (16 numbers, column-major) from the alignment tool (7.3). */
      alignment: z.array(z.number().finite()).length(16).optional(),
      /** Per room: where the camera stands and looks (aligned metres, Stage 7.4). */
      viewpoints: z
        .array(z.object({ roomId: z.string().min(1).max(64), position: vec3, target: vec3 }))
        .max(40)
        .optional(),
      /** Doorways connecting rooms (route for room-to-room transitions). */
      doorways: z
        .array(
          z.object({
            a: z.string().min(1).max(64),
            b: z.string().min(1).max(64),
            position: vec3,
          }),
        )
        .max(80)
        .optional(),
    })
    .optional(),
});

export type GuestExperience = z.infer<typeof guestExperienceSchema>;
export type GuestAppliance = z.infer<typeof guestApplianceSchema>;
export type GuestRoom = z.infer<typeof guestRoomSchema>;

export type GuestLocale = 'en' | 'ar';

export function pick(value: Localized, locale: GuestLocale): string {
  return locale === 'ar' && value.ar ? value.ar : value.en;
}

/** Arabic search normalisation: strip diacritics/tatweel, unify alef/yaa/taa marbuta forms. */
export function normalizeQuery(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface SearchHit {
  appliance: GuestAppliance;
  room: GuestRoom | undefined;
  /** Alias that matched when it differs from the visible name. */
  matchedAlias?: string;
}

/**
 * Appliance search for guests (requirement SR-*, DESIGN_SYSTEM 9.4): matches EN/AR names and
 * aliases; one hit per appliance so "AC" returns every AC with its own room.
 */
export function searchAppliances(
  experience: GuestExperience,
  query: string,
  locale: GuestLocale,
): SearchHit[] {
  const q = normalizeQuery(query);
  if (!q) return [];
  const rooms = new Map(experience.rooms.map((r) => [r.id, r]));
  const hits: Array<SearchHit & { score: number }> = [];
  for (const appliance of experience.appliances) {
    const names = [appliance.name.en, appliance.name.ar ?? ''].map(normalizeQuery);
    const aliases = [...appliance.aliases.en, ...appliance.aliases.ar];
    let score = 0;
    let matchedAlias: string | undefined;
    if (names.some((n) => n === q)) score = 3;
    else if (names.some((n) => n.split(' ').some((w) => w.startsWith(q)) || n.includes(q)))
      score = 2;
    else {
      const alias = aliases.find((a) => {
        const n = normalizeQuery(a);
        return n === q || n.startsWith(q) || n.split(' ').some((w) => w.startsWith(q));
      });
      if (alias) {
        score = 1;
        matchedAlias = alias;
      }
    }
    if (score > 0) {
      const hit: SearchHit & { score: number } = {
        appliance,
        room: rooms.get(appliance.roomId),
        score,
      };
      if (matchedAlias) hit.matchedAlias = matchedAlias;
      hits.push(hit);
    }
  }
  const roomOrder = new Map(experience.rooms.map((r, i) => [r.id, i]));
  return hits
    .sort(
      (a, b) =>
        b.score - a.score ||
        (roomOrder.get(a.appliance.roomId) ?? 0) - (roomOrder.get(b.appliance.roomId) ?? 0) ||
        pick(a.appliance.name, locale).localeCompare(pick(b.appliance.name, locale)),
    )
    .map(({ score: _score, ...hit }) => hit);
}
