import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYOUT,
  applianceSchema,
  ROOM_TYPES,
  ROOM_TYPE_LABELS,
  apartmentSchema,
  layoutSchema,
  layoutSummary,
  missingPlannedRooms,
  moveInOrder,
  parseLayout,
  propertyColumns,
  propertySchema,
  roomSchema,
  roomsFromLayout,
} from './property.ts';

const formLayout = {
  bedrooms: '2',
  bathrooms: '2',
  balconies: '1',
  hallways: '1',
  kitchen: 'separate',
  dining: 'on',
};

describe('propertySchema', () => {
  it('trims, upper-cases the country and turns empty fields into null', () => {
    const r = propertySchema.parse({
      name: '  Marina Heights ',
      addressLine1: '',
      city: ' Dubai ',
      countryCode: 'ae',
      supportPhone: '+971 4 123 4567',
      supportEmail: '',
      supportWhatsapp: '',
    });
    expect(r).toEqual({
      name: 'Marina Heights',
      addressLine1: null,
      city: 'Dubai',
      countryCode: 'AE',
      supportPhone: '+971 4 123 4567',
      supportEmail: null,
      supportWhatsapp: null,
    });
    expect(propertyColumns(r)).toMatchObject({ country_code: 'AE', address_line1: null });
  });

  it('rejects values the database would reject', () => {
    const r = propertySchema.safeParse({
      name: ' ',
      countryCode: 'UAE',
      supportPhone: 'call me',
      supportEmail: 'nope',
      supportWhatsapp: '+97 1',
    });
    expect(r.success).toBe(false);
    const codes = Object.fromEntries(r.error!.issues.map((i) => [i.path[0], i.message]));
    expect(codes).toEqual({
      name: 'NAME_REQUIRED',
      countryCode: 'INVALID_COUNTRY',
      supportPhone: 'INVALID_PHONE',
      supportEmail: 'INVALID_EMAIL',
      supportWhatsapp: 'INVALID_PHONE',
    });
  });

  it('limits lengths', () => {
    expect(propertySchema.safeParse({ name: 'x'.repeat(121) }).success).toBe(false);
    expect(propertySchema.safeParse({ name: 'ok', city: 'x'.repeat(101) }).success).toBe(false);
  });
});

describe('layoutSchema', () => {
  it('coerces form values and checkbox flags', () => {
    expect(layoutSchema.parse(formLayout)).toEqual({
      bedrooms: 2,
      bathrooms: 2,
      balconies: 1,
      hallways: 1,
      kitchen: 'separate',
      dining: true,
      laundry: false,
      office: false,
      storage: false,
    });
  });

  it('rejects out-of-range and fractional counts', () => {
    for (const bad of [
      { bedrooms: '-1' },
      { bedrooms: '11' },
      { bathrooms: '0' },
      { balconies: '1.5' },
      { kitchen: 'outdoor' },
      { bedrooms: 'two' },
    ]) {
      expect(layoutSchema.safeParse({ ...formLayout, ...bad }).success, JSON.stringify(bad)).toBe(
        false,
      );
    }
  });

  it('parseLayout returns null for legacy empty layouts', () => {
    expect(parseLayout({})).toBeNull();
    expect(parseLayout(DEFAULT_LAYOUT)).toEqual(DEFAULT_LAYOUT);
  });
});

describe('apartmentSchema', () => {
  it('requires a property id and a name', () => {
    const r = apartmentSchema.safeParse({ propertyId: 'x', name: '', layout: formLayout });
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.message).sort()).toEqual([
      'NAME_REQUIRED',
      'PROPERTY_REQUIRED',
    ]);
  });
});

describe('roomsFromLayout', () => {
  it('lists rooms in walking order with numbered names only when needed', () => {
    const rooms = roomsFromLayout(layoutSchema.parse(formLayout));
    expect(rooms.map((r) => r.nameEn)).toEqual([
      'Entrance',
      'Living room',
      'Kitchen',
      'Dining area',
      'Hallway',
      'Bedroom 1',
      'Bedroom 2',
      'Bathroom 1',
      'Bathroom 2',
      'Balcony',
    ]);
    expect(rooms.find((r) => r.nameEn === 'Bedroom 2')?.nameAr).toBe('غرفة النوم ٢');
    expect(rooms.map((r) => r.sortOrder)).toEqual(rooms.map((_, i) => (i + 1) * 10));
  });

  it('studio with an open kitchen has no kitchen or bedroom rooms', () => {
    const rooms = roomsFromLayout({
      ...DEFAULT_LAYOUT,
      bedrooms: 0,
      hallways: 0,
      kitchen: 'open',
    });
    expect(rooms.map((r) => r.roomType)).toEqual(['entrance', 'living', 'bathroom']);
  });

  it('names are unique (DB unique (apartment_id, name_en)) for the largest layout', () => {
    const rooms = roomsFromLayout({
      bedrooms: 10,
      bathrooms: 10,
      balconies: 5,
      hallways: 5,
      kitchen: 'separate',
      dining: true,
      laundry: true,
      office: true,
      storage: true,
    });
    expect(new Set(rooms.map((r) => r.nameEn)).size).toBe(rooms.length);
    expect(rooms.every((r) => r.nameEn.length <= 80 && r.nameAr.length <= 80)).toBe(true);
  });
});

describe('layoutSummary', () => {
  it('summarises', () => {
    expect(layoutSummary(null)).toBe('Layout not set');
    expect(layoutSummary({ ...DEFAULT_LAYOUT, bedrooms: 0 })).toBe('Studio · 1 bathroom');
    expect(layoutSummary({ ...DEFAULT_LAYOUT, bedrooms: 2, bathrooms: 2, balconies: 2 })).toBe(
      '2 bedrooms · 2 bathrooms · 2 balconies',
    );
  });
});

describe('rooms', () => {
  it('roomSchema mirrors the DB checks', () => {
    expect(roomSchema.parse({ nameEn: ' Guest room ', nameAr: '', roomType: 'bedroom' })).toEqual({
      nameEn: 'Guest room',
      nameAr: null,
      roomType: 'bedroom',
    });
    expect(roomSchema.safeParse({ nameEn: 'x'.repeat(81), roomType: 'bedroom' }).success).toBe(
      false,
    );
    expect(roomSchema.safeParse({ nameEn: 'Gym', roomType: 'gym' }).success).toBe(false);
    expect(ROOM_TYPES.every((t) => ROOM_TYPE_LABELS[t])).toBe(true);
  });

  it('missingPlannedRooms ignores case and existing custom names', () => {
    const planned = roomsFromLayout({ ...DEFAULT_LAYOUT, bedrooms: 2 });
    const missing = missingPlannedRooms(planned, ['entrance', 'Living room', 'Bedroom 1', 'Gym']);
    expect(missing.map((r) => r.nameEn)).toEqual(['Kitchen', 'Hallway', 'Bedroom 2', 'Bathroom']);
  });

  it('moveInOrder swaps neighbours and ignores impossible moves', () => {
    expect(moveInOrder(['a', 'b', 'c'], 'b', 'up')).toEqual(['b', 'a', 'c']);
    expect(moveInOrder(['a', 'b', 'c'], 'b', 'down')).toEqual(['a', 'c', 'b']);
    expect(moveInOrder(['a', 'b', 'c'], 'a', 'up')).toEqual(['a', 'b', 'c']);
    expect(moveInOrder(['a', 'b', 'c'], 'c', 'down')).toEqual(['a', 'b', 'c']);
    expect(moveInOrder(['a', 'b'], 'zz', 'up')).toEqual(['a', 'b']);
  });
});

describe('applianceSchema (8.1)', () => {
  const room = '11111111-1111-4111-8111-111111111111';
  const cat = '22222222-2222-4222-8222-222222222222';
  it('accepts a minimal appliance and clears empty optional fields', () => {
    const r = applianceSchema.parse({
      roomId: room,
      categoryId: cat,
      nameEn: '  Living room AC ',
      nameAr: ' ',
      brand: 'Daikin',
      modelNumber: '',
      notes: undefined,
    });
    expect(r).toEqual({
      roomId: room,
      categoryId: cat,
      nameEn: 'Living room AC',
      nameAr: null,
      brand: 'Daikin',
      modelNumber: null,
      notes: null,
    });
  });
  it('reports a missing room, category or name and over-long text', () => {
    const r = applianceSchema.safeParse({
      roomId: '',
      categoryId: 'x',
      nameEn: '',
      notes: 'n'.repeat(2001),
    });
    expect(r.success).toBe(false);
    const codes = Object.fromEntries(r.error!.issues.map((i) => [i.path[0], i.message]));
    expect(codes).toEqual({
      roomId: 'ROOM_REQUIRED',
      categoryId: 'CATEGORY_REQUIRED',
      nameEn: 'NAME_REQUIRED',
      notes: 'TOO_LONG',
    });
  });
});
