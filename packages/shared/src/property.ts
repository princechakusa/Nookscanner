/**
 * Property, apartment and layout-questionnaire input rules (mirror the DB checks in the
 * foundation migration) and the room plan generated from the questionnaire (PR-02, CP-02).
 */
import { z } from 'zod';

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

export type RoomType =
  | 'entrance'
  | 'living'
  | 'kitchen'
  | 'dining'
  | 'bedroom'
  | 'bathroom'
  | 'hallway'
  | 'balcony'
  | 'laundry'
  | 'office'
  | 'storage'
  | 'other';

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
