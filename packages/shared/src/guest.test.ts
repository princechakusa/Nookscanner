import { describe, expect, it } from 'vitest';
import {
  guestExperienceSchema,
  normalizeQuery,
  pick,
  searchAppliances,
  type GuestExperience,
} from './guest.ts';

const exp: GuestExperience = guestExperienceSchema.parse({
  apartment: { name: { en: 'Test flat', ar: 'شقة' } },
  rooms: [
    { id: 'living', type: 'living', name: { en: 'Living room', ar: 'غرفة المعيشة' } },
    { id: 'bed1', type: 'bedroom', name: { en: 'Bedroom 1', ar: 'غرفة النوم ١' } },
    { id: 'kitchen', type: 'kitchen', name: { en: 'Kitchen', ar: 'المطبخ' } },
  ],
  appliances: [
    {
      id: 'ac-bed',
      roomId: 'bed1',
      category: 'air_conditioner',
      name: { en: 'Bedroom AC', ar: 'مكيف غرفة النوم' },
      aliases: { en: ['ac', 'air conditioner', 'split unit'], ar: ['مكيف', 'تكييف'] },
      verified: true,
      steps: [],
      troubleshooting: [],
    },
    {
      id: 'ac-living',
      roomId: 'living',
      category: 'air_conditioner',
      name: { en: 'Living room AC', ar: 'مكيف غرفة المعيشة' },
      aliases: { en: ['ac', 'air conditioner'], ar: ['مكيف'] },
      verified: true,
      steps: [],
      troubleshooting: [],
    },
    {
      id: 'oven',
      roomId: 'kitchen',
      category: 'oven',
      name: { en: 'Oven', ar: 'الفرن' },
      aliases: { en: ['cooker'], ar: ['فرن'] },
      verified: false,
      steps: [],
      troubleshooting: [],
    },
  ],
  support: { whatsapp: '971500000000' },
});

describe('guest experience schema', () => {
  it('rejects HTML-ish or oversized values and non-https media', () => {
    expect(
      guestExperienceSchema.safeParse({
        ...exp,
        rooms: [{ id: 'x', type: 'garage', name: { en: 'X' } }],
      }).success,
    ).toBe(false);
    const withVideo = structuredClone(exp);
    withVideo.appliances[0]!.video = { url: 'http://insecure.example/v.mp4', durationSec: 10 };
    expect(guestExperienceSchema.safeParse(withVideo).success).toBe(false);
    withVideo.appliances[0]!.video = { url: 'javascript:alert(1)', durationSec: 10 };
    expect(guestExperienceSchema.safeParse(withVideo).success).toBe(false);
  });
});

describe('appliance search (SR, DESIGN_SYSTEM 9.4)', () => {
  it('"AC" returns every AC with its own room, in room order', () => {
    const hits = searchAppliances(exp, 'AC', 'en');
    expect(hits.map((h) => [h.appliance.id, h.room?.name.en])).toEqual([
      ['ac-living', 'Living room'],
      ['ac-bed', 'Bedroom 1'],
    ]);
  });

  it('matches aliases and reports the alias', () => {
    const [hit] = searchAppliances(exp, 'split', 'en');
    expect(hit?.appliance.id).toBe('ac-bed');
    expect(hit?.matchedAlias).toBe('split unit');
    expect(searchAppliances(exp, 'cooker', 'en')[0]?.appliance.id).toBe('oven');
  });

  it('matches Arabic with or without the definite article and diacritics', () => {
    expect(searchAppliances(exp, 'مكيف', 'ar')).toHaveLength(2);
    expect(searchAppliances(exp, 'فُرن', 'ar')[0]?.appliance.id).toBe('oven');
    expect(normalizeQuery('إِضاءة')).toBe('اضاءه');
  });

  it('returns nothing for empty or unmatched queries', () => {
    expect(searchAppliances(exp, '   ', 'en')).toEqual([]);
    expect(searchAppliances(exp, 'jacuzzi', 'en')).toEqual([]);
  });

  it('picks the locale with English fallback', () => {
    expect(pick({ en: 'Oven' }, 'ar')).toBe('Oven');
    expect(pick({ en: 'Oven', ar: 'فرن' }, 'ar')).toBe('فرن');
  });
});

describe('search 9.3: EN/AR, room words, Arabic spelling variants', () => {
  const names = (q: string, locale: 'en' | 'ar' = 'en') =>
    searchAppliances(exp, q, locale).map((h) => h.appliance.name.en);

  it('"AC" returns every AC with its own room (acceptance)', () => {
    const hits = searchAppliances(exp, 'AC', 'en');
    expect(hits.map((h) => [h.appliance.name.en, h.room?.name.en])).toEqual([
      ['Living room AC', 'Living room'],
      ['Bedroom AC', 'Bedroom 1'],
    ]);
  });

  it('room words narrow the result, in any order', () => {
    expect(names('ac bedroom')).toEqual(['Bedroom AC']);
    expect(names('living ac')).toEqual(['Living room AC']);
    expect(names('air conditioner living')).toEqual(['Living room AC']);
    expect(names('ac kitchen')).toEqual([]);
  });

  it('Arabic: the article, diacritics, alef forms and Arabic-Indic digits do not matter', () => {
    expect(names('المكيف', 'ar')).toEqual(['Living room AC', 'Bedroom AC']);
    expect(names('مُكَيِّف', 'ar')).toEqual(['Living room AC', 'Bedroom AC']);
    expect(names('مكيف النوم', 'ar')).toEqual(['Bedroom AC']);
    expect(names('مكيف غرفة النوم 1', 'ar')).toEqual(['Bedroom AC']);
    expect(names('فرن', 'ar')).toEqual(['Oven']);
    expect(normalizeQuery('غرفة النوم ١')).toBe('غرفه النوم 1');
    expect(normalizeQuery('أإآ')).toBe('ااا');
  });

  it('mixes languages and keeps aliases visible', () => {
    const [hit] = searchAppliances(exp, 'تكييف', 'ar');
    expect(hit?.appliance.name.en).toBe('Bedroom AC');
    expect(hit?.matchedAlias).toBe('تكييف');
  });
});
