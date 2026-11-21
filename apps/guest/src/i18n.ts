/** Guest UI strings (EN + AR, requirement GX-04). Content strings come from the published snapshot. */
export type Locale = 'en' | 'ar';

export const messages = {
  en: {
    languageToggle: 'عربي',
    languageToggleLabel: 'Switch to Arabic',
    languageGroupLabel: 'Language',
    scanPromptTitle: 'Scan the QR code in your apartment',
    scanPromptBody:
      'Your host placed a Nookscanner code inside the apartment. Scan it with your phone camera to explore the apartment and see how everything works.',
    loadingTitle: 'Preparing your apartment',
    loadingBody: 'Your interactive apartment guide is getting ready.',
    notConnected: 'This apartment guide is not available yet.',
    demoBadge: 'Demo',
    roomsLabel: 'Rooms',
    allRooms: 'All rooms',
    searchLabel: 'Search appliances',
    searchPlaceholder: 'Search: AC, oven, Wi-Fi',
    noResults: 'No appliance called "{q}" in this apartment.',
    browseAll: 'Browse all appliances',
    matches: 'matches: {alias}',
    viewerPending:
      'The 3D apartment is being prepared. You can already browse every appliance below.',
    resetView: 'Reset view',
    sceneTooSlow: 'The 3D view is too slow on this device. All appliances are listed below.',
    showList: 'Show the list instead',
    sceneLoading: 'Loading the 3D apartment',
    sceneFailed:
      'The 3D apartment could not be shown on this device. Every appliance is listed below.',
    viewerUnsupported:
      'This device cannot show the 3D apartment. Here is every appliance by room instead.',
    appliancesIn: 'Appliances in {room}',
    verified: 'Verified',
    stepsTitle: 'How to use it',
    troubleshootingTitle: 'Troubleshooting',
    watchVideo: 'Watch {s} sec video',
    contactSupport: 'Still need help? Contact support',
    close: 'Close',
    supportWhatsapp: 'WhatsApp',
    supportPhone: 'Call',
    supportEmail: 'Email',
  },
  ar: {
    languageToggle: 'English',
    languageToggleLabel: 'التبديل إلى الإنجليزية',
    languageGroupLabel: 'اللغة',
    scanPromptTitle: 'امسح رمز QR الموجود في شقتك',
    scanPromptBody:
      'وضع المضيف رمز Nookscanner داخل الشقة. امسحه بكاميرا هاتفك لاستكشاف الشقة ومعرفة طريقة استخدام كل شيء.',
    loadingTitle: 'يجري تجهيز شقتك',
    loadingBody: 'دليل شقتك التفاعلي قيد التحضير.',
    notConnected: 'دليل هذه الشقة غير متاح بعد.',
    demoBadge: 'تجريبي',
    roomsLabel: 'الغرف',
    allRooms: 'كل الغرف',
    searchLabel: 'ابحث عن الأجهزة',
    searchPlaceholder: 'ابحث: مكيف، فرن، واي فاي',
    noResults: 'لا يوجد جهاز باسم "{q}" في هذه الشقة.',
    browseAll: 'تصفح كل الأجهزة',
    matches: 'يطابق: {alias}',
    viewerPending: 'يجري تجهيز الشقة ثلاثية الأبعاد. يمكنك تصفح جميع الأجهزة أدناه.',
    resetView: 'إعادة ضبط العرض',
    sceneTooSlow: 'العرض ثلاثي الأبعاد بطيء جدًا على هذا الجهاز. جميع الأجهزة مدرجة أدناه.',
    showList: 'اعرض القائمة بدلًا من ذلك',
    sceneLoading: 'يجري تحميل الشقة ثلاثية الأبعاد',
    sceneFailed: 'تعذّر عرض الشقة ثلاثية الأبعاد على هذا الجهاز. جميع الأجهزة مدرجة أدناه.',
    viewerUnsupported:
      'لا يمكن لهذا الجهاز عرض الشقة ثلاثية الأبعاد. إليك جميع الأجهزة حسب الغرفة.',
    appliancesIn: 'الأجهزة في {room}',
    verified: 'موثّق',
    stepsTitle: 'طريقة الاستخدام',
    troubleshootingTitle: 'حل المشكلات',
    watchVideo: 'شاهد الفيديو ({s} ث)',
    contactSupport: 'هل تحتاج مساعدة؟ تواصل معنا',
    close: 'إغلاق',
    supportWhatsapp: 'واتساب',
    supportPhone: 'اتصال',
    supportEmail: 'بريد إلكتروني',
  },
} as const satisfies Record<Locale, Record<string, string>>;

export type MessageKey = keyof (typeof messages)['en'];

export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ''));
}

export function detectLocale(languages: readonly string[]): Locale {
  for (const lang of languages) {
    const base = lang.toLowerCase().split('-')[0];
    if (base === 'ar') return 'ar';
    if (base === 'en') return 'en';
  }
  return 'en';
}

export function directionOf(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

/** Arabic-Indic digits for Arabic UI numbering (step badges). */
export function localDigits(n: number, locale: Locale): string {
  return locale === 'ar' ? n.toLocaleString('ar-EG') : String(n);
}
