/**
 * Property, apartment and layout-questionnaire input rules (mirror the DB checks in the
 * foundation migration) and the room plan generated from the questionnaire (PR-02, CP-02).
 */
import { z } from 'zod';
import { ROOM_TYPES } from './guest.ts';

export { ROOM_TYPES };

/** Empty form fields become `null` so optional columns are cleared, not set to ''. */
const optionalText = (max: number, pattern?: RegExp, message = 'INVALID_VALUE') =>
  z.preprocess(
    (v) =>
      v === undefined || (typeof v === 'string' && v.trim() === '')
        ? null
        : typeof v === 'string'
          ? v.trim()
          : v,
    (pattern
      ? z.string().max(max, { message: 'TOO_LONG' }).regex(pattern, { message })
      : z.string().max(max, { message: 'TOO_LONG' })
    ).nullable(),
  );

const name = (max: number) =>
  z.string().trim().min(1, { message: 'NAME_REQUIRED' }).max(max, { message: 'TOO_LONG' });

export const propertySchema = z.object({
  name: name(120),
  addressLine1: optionalText(200),
  city: optionalText(100),
  countryCode: z.preprocess(
    (v) => (v === undefined ? null : typeof v === 'string' ? v.trim().toUpperCase() || null : v),
    z
      .string()
      .regex(/^[A-Z]{2}$/, { message: 'INVALID_COUNTRY' })
      .nullable(),
  ),
  supportPhone: optionalText(24, /^\+?[0-9 ()-]{6,24}$/, 'INVALID_PHONE'),
  supportEmail: optionalText(254, /^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'INVALID_EMAIL'),
  supportWhatsapp: optionalText(21, /^\+?[0-9]{6,20}$/, 'INVALID_PHONE'),
});
export type PropertyInput = z.infer<typeof propertySchema>;

/** DB column names for a validated property (used by the dashboard insert/update). */
export function propertyColumns(p: PropertyInput) {
  return {
    name: p.name,
    address_line1: p.addressLine1,
    city: p.city,
    country_code: p.countryCode,
    support_phone: p.supportPhone,
    support_email: p.supportEmail,
    support_whatsapp: p.supportWhatsapp,
  };
}

export const KITCHEN_KINDS = ['separate', 'open', 'none'] as const;

const count = (min: number, max: number) =>
  z.coerce
    .number({ message: 'INVALID_COUNT' })
    .int({ message: 'INVALID_COUNT' })
    .min(min, {
      message: 'INVALID_COUNT',
    })
    .max(max, { message: 'INVALID_COUNT' });

const flag = z.preprocess((v) => v === true || v === 'on' || v === 'true', z.boolean());

/** Layout questionnaire; stored as `apartments.layout` (jsonb). 0 bedrooms = studio. */
export const layoutSchema = z.object({
  bedrooms: count(0, 10),
  bathrooms: count(1, 10),
  balconies: count(0, 5),
  hallways: count(0, 5),
  kitchen: z.enum(KITCHEN_KINDS, { message: 'INVALID_VALUE' }),
  dining: flag,
  laundry: flag,
  office: flag,
  storage: flag,
});
export type ApartmentLayout = z.infer<typeof layoutSchema>;

export const DEFAULT_LAYOUT: ApartmentLayout = {
  bedrooms: 1,
  bathrooms: 1,
  balconies: 0,
  hallways: 1,
  kitchen: 'separate',
  dining: false,
  laundry: false,
  office: false,
  storage: false,
};

/** Reads a stored layout; anything invalid or missing (older rows: `{}`) gives `null`. */
export function parseLayout(value: unknown): ApartmentLayout | null {
  const r = layoutSchema.safeParse(value);
  return r.success ? r.data : null;
}

export const apartmentSchema = z.object({
  propertyId: z.uuid({ message: 'PROPERTY_REQUIRED' }),
  name: name(120),
  unitNumber: optionalText(40),
  floor: optionalText(20),
  layout: layoutSchema,
});
export type ApartmentInput = z.infer<typeof apartmentSchema>;

export type RoomType = (typeof ROOM_TYPES)[number];

export interface PlannedRoom {
  roomType: RoomType;
  nameEn: string;
  nameAr: string;
  sortOrder: number;
}

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const arNum = (n: number) => String(n).replace(/[0-9]/g, (d) => AR_DIGITS[Number(d)] ?? d);

const NAMES: Record<Exclude<RoomType, 'other'>, [string, string]> = {
  entrance: ['Entrance', 'المدخل'],
  living: ['Living room', 'غرفة المعيشة'],
  kitchen: ['Kitchen', 'المطبخ'],
  dining: ['Dining area', 'منطقة الطعام'],
  hallway: ['Hallway', 'الممر'],
  bedroom: ['Bedroom', 'غرفة النوم'],
  bathroom: ['Bathroom', 'الحمّام'],
  balcony: ['Balcony', 'الشرفة'],
  laundry: ['Laundry', 'غرفة الغسيل'],
  office: ['Office', 'المكتب'],
  storage: ['Storage', 'المخزن'],
};

/**
 * Pre-scan room list in walking order (entrance first, as the capture checkpoint plan expects).
 * Numbered names only when there is more than one room of a type ("Bedroom 1", "Bedroom 2").
 * An open kitchen is part of the living room, so it gets no separate room.
 */
export function roomsFromLayout(layout: ApartmentLayout): PlannedRoom[] {
  const rooms: PlannedRoom[] = [];
  const add = (type: Exclude<RoomType, 'other'>, total = 1) => {
    for (let i = 1; i <= total; i += 1) {
      const [en, ar] = NAMES[type];
      rooms.push({
        roomType: type,
        nameEn: total > 1 ? `${en} ${i}` : en,
        nameAr: total > 1 ? `${ar} ${arNum(i)}` : ar,
        sortOrder: (rooms.length + 1) * 10,
      });
    }
  };
  add('entrance');
  add('living');
  if (layout.kitchen === 'separate') add('kitchen');
  if (layout.dining) add('dining');
  add('hallway', layout.hallways);
  add('bedroom', layout.bedrooms);
  add('bathroom', layout.bathrooms);
  add('balcony', layout.balconies);
  if (layout.laundry) add('laundry');
  if (layout.office) add('office');
  if (layout.storage) add('storage');
  return rooms;
}

/** Short human summary, e.g. "2 bedrooms · 1 bathroom · balcony" or "Studio · 1 bathroom". */
export function layoutSummary(layout: ApartmentLayout | null): string {
  if (!layout) return 'Layout not set';
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const parts = [
    layout.bedrooms === 0 ? 'Studio' : plural(layout.bedrooms, 'bedroom'),
    plural(layout.bathrooms, 'bathroom'),
  ];
  if (layout.balconies > 0) parts.push(plural(layout.balconies, 'balcony', 'balconies'));
  return parts.join(' · ');
}

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  entrance: 'Entrance',
  living: 'Living room',
  kitchen: 'Kitchen',
  dining: 'Dining area',
  bedroom: 'Bedroom',
  bathroom: 'Bathroom',
  hallway: 'Hallway',
  balcony: 'Balcony',
  laundry: 'Laundry',
  office: 'Office',
  storage: 'Storage',
  other: 'Other',
};

/** A room as entered by a manager (mirrors `rooms` checks: name_en 1..80, name_ar <= 80). */
export const roomSchema = z.object({
  nameEn: name(80),
  nameAr: optionalText(80),
  roomType: z.enum(ROOM_TYPES, { message: 'INVALID_VALUE' }),
});
export type RoomInput = z.infer<typeof roomSchema>;

/** Planned rooms not yet created (matched by English name, the DB's unique key per apartment). */
export function missingPlannedRooms(
  planned: readonly PlannedRoom[],
  existingNamesEn: readonly string[],
): PlannedRoom[] {
  const have = new Set(existingNamesEn.map((n) => n.trim().toLowerCase()));
  return planned.filter((r) => !have.has(r.nameEn.toLowerCase()));
}

/**
 * New order after moving one room up or down. Returns ids in order; the caller stores
 * `sort_order = (index + 1) * 10`. Unknown ids or moves past either end change nothing.
 */
export function moveInOrder(
  ids: readonly string[],
  id: string,
  direction: 'up' | 'down',
): string[] {
  const out = [...ids];
  const i = out.indexOf(id);
  const j = direction === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= out.length) return out;
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
}

/** Appliance in a room (Stage 8.1; mirrors the checks in migration 20261121001000). */
export const applianceSchema = z.object({
  roomId: z.uuid({ message: 'ROOM_REQUIRED' }),
  categoryId: z.uuid({ message: 'CATEGORY_REQUIRED' }),
  nameEn: name(80),
  nameAr: optionalText(80),
  brand: optionalText(60),
  modelNumber: optionalText(60),
  notes: optionalText(2000),
});
export type ApplianceInput = z.infer<typeof applianceSchema>;

/**
 * One saved version of an appliance's instructions in one language (Stage 8.3; mirrors
 * check_instruction_version). Steps come from a textarea, one step per line; troubleshooting
 * from problem/solution pairs; empty pairs are dropped.
 */
export const instructionSchema = z.object({
  locale: z.enum(['en', 'ar'], { message: 'INVALID_VALUE' }),
  title: name(120),
  steps: z
    .string()
    .transform((s) =>
      s
        .split(/\r?\n/)
        .map((l) => l.replace(/^\s*(\d{1,3}[.)]|[-*])\s+/, '').trim())
        .filter(Boolean),
    )
    .pipe(
      z
        .array(z.string().max(1000, { message: 'STEP_TOO_LONG' }))
        .min(1, { message: 'STEPS_REQUIRED' })
        .max(30, { message: 'TOO_MANY_STEPS' }),
    ),
  troubleshooting: z
    .array(z.object({ problem: z.string().trim(), solution: z.string().trim() }))
    .max(20)
    .transform((pairs) => pairs.filter((p) => p.problem || p.solution))
    .pipe(
      z.array(
        z.object({
          problem: z
            .string()
            .min(1, { message: 'PROBLEM_REQUIRED' })
            .max(300, { message: 'TOO_LONG' }),
          solution: z
            .string()
            .min(1, { message: 'SOLUTION_REQUIRED' })
            .max(1000, { message: 'TOO_LONG' }),
        }),
      ),
    ),
  bodyMd: optionalText(5000),
});
export type InstructionInput = z.infer<typeof instructionSchema>;
