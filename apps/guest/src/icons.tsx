/** Line icons for appliance categories and room types (24 px grid, stroke = currentColor). */
const PATHS: Record<string, string> = {
  air_conditioner: 'M3 6h18v6H3zM6 15v2M10 15v4M14 15v4M18 15v2M6 9h8',
  tv: 'M3 5h18v11H3zM8 20h8M12 16v4',
  router: 'M4 14h16v5H4zM8 16.5h.01M12 10a4 4 0 0 1 4 2M12 7a7 7 0 0 1 7 4M12 10a4 4 0 0 0-4 2',
  oven: 'M4 3h16v18H4zM4 8h16M8 5.5h.01M12 5.5h.01M7 11h10v7H7z',
  washer: 'M5 3h14v18H5zM5 7h14M12 14m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0',
  default: 'M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0M12 8v5M12 16h.01',
  living: 'M4 12V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3M3 12h18v5H3zM5 17v2M19 17v2',
  kitchen: 'M5 10h14v9H5zM8 10V7a4 4 0 0 1 8 0v3M9 14h6',
  bedroom: 'M3 18V8M3 13h18v5M21 18v-5M7 13V10h5v3',
  bathroom: 'M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM6 12V5a2 2 0 0 1 4 0',
  room: 'M4 20V9l8-5 8 5v11zM10 20v-6h4v6',
  search: 'M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M20 20l-4-4',
  play: 'M8 5l11 7-11 7z',
  support: 'M4 13a8 8 0 0 1 16 0M4 13v4h3v-5H4M20 13v4h-3v-5h3M17 17a5 5 0 0 1-5 3',
  check: 'M5 12l4 4 10-10',
  help: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01',
  close: 'M6 6l12 12M18 6L6 18',
};

const ROOM_ICON: Record<string, string> = {
  living: 'living',
  dining: 'living',
  kitchen: 'kitchen',
  bedroom: 'bedroom',
  bathroom: 'bathroom',
};

export function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <svg className={className ?? 'g-icon'} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={PATHS[name] ?? PATHS.default}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const roomIcon = (type: string) => ROOM_ICON[type] ?? 'room';
export const categoryIcon = (category: string) => (PATHS[category] ? category : 'default');

/** Brand mark: the Open Door app icon (store/logo-final), shown small in the top bar. */
export function BrandMark() {
  return <img className="g-brandmark" src="/brand-mark.png" alt="" width={26} height={26} />;
}
