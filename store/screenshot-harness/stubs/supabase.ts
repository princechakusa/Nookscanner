// Demo data in place of the live database; the screens themselves are the real app code.
const q = new URLSearchParams(location.search);
const signedIn = q.get('signedin') !== '0';
const tables: Record<string, unknown[]> = {
  apartments: [
    {
      id: 'a1',
      name: 'Harbour View 1204',
      unit_number: '1204',
      properties: { name: 'Harbour View Tower' },
      rooms: [{ count: 6 }],
    },
    {
      id: 'a2',
      name: 'Cedar Court 3B',
      unit_number: '3B',
      properties: { name: 'Cedar Court' },
      rooms: [{ count: 4 }],
    },
    {
      id: 'a3',
      name: 'Palm Grove Villa 7',
      unit_number: null,
      properties: { name: 'Palm Grove Residences' },
      rooms: [{ count: 9 }],
    },
    {
      id: 'a4',
      name: 'Sandstone Loft 502',
      unit_number: '502',
      properties: { name: 'Sandstone Lofts' },
      rooms: [{ count: 3 }],
    },
    {
      id: 'a5',
      name: 'Marina Walk 1810',
      unit_number: '1810',
      properties: { name: 'Marina Walk' },
      rooms: [{ count: 0 }],
    },
  ],
  rooms: [
    { id: 'r1', name_en: 'Entrance hall', name_ar: null, room_type: 'entrance' },
    { id: 'r2', name_en: 'Living room', name_ar: null, room_type: 'living' },
    { id: 'r3', name_en: 'Kitchen', name_ar: null, room_type: 'kitchen' },
    { id: 'r4', name_en: 'Master bedroom', name_ar: null, room_type: 'bedroom' },
    { id: 'r5', name_en: 'Bathroom', name_ar: null, room_type: 'bathroom' },
    { id: 'r6', name_en: 'Balcony', name_ar: null, room_type: 'balcony' },
  ],
  scan_sessions: [{ id: 's1' }],
};

function builder(table: string): unknown {
  const result = { data: tables[table] ?? null, error: null };
  const b: unknown = new Proxy(() => {}, {
    get(_t, prop) {
      if (prop === 'then') return (res: (v: unknown) => void) => res(result);
      if (prop === 'single')
        return () => Promise.resolve({ data: (tables[table] ?? [])[0] ?? null, error: null });
      return () => b;
    },
  });
  return b;
}

const session = signedIn ? { user: { id: 'u1' }, access_token: 'x' } : null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: any = {
  from: builder,
  auth: {
    getSession: async () => ({ data: { session } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signInWithPassword: async () => ({ error: null }),
    signOut: async () => ({}),
  },
};
export const supabaseConfig = { url: 'https://example.supabase.co', anonKey: 'x' };
export const secureStorage = {};
