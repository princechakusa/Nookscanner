/** Guest UI strings (EN + AR, requirement GX-04). Content strings come from the published snapshot. */
export type Locale = 'en' | 'ar';

export const messages = {
  en: {
    languageToggle: 'عربي',
    languageToggleLabel: 'Switch to Arabic',
    scanPromptTitle: 'Scan the QR code in your apartment',
    scanPromptBody:
      'Your host placed a Nooktour code inside the apartment. Scan it with your phone camera to explore the apartment and see how everything works.',
    loadingTitle: 'Preparing your apartment',
    loadingBody: 'Your interactive apartment guide is getting ready.',
    notConnected: 'This apartment guide is not available yet.',
  },
  ar: {
    languageToggle: 'English',
    languageToggleLabel: 'التبديل إلى الإنجليزية',
    scanPromptTitle: 'امسح رمز QR الموجود في شقتك',
    scanPromptBody:
      'وضع المضيف رمز Nooktour داخل الشقة. امسحه بكاميرا هاتفك لاستكشاف الشقة ومعرفة طريقة استخدام كل شيء.',
    loadingTitle: 'جارٍ تجهيز شقتك',
    loadingBody: 'دليل شقتك التفاعلي قيد التحضير.',
    notConnected: 'دليل هذه الشقة غير متاح بعد.',
  },
} as const satisfies Record<Locale, Record<string, string>>;

export type MessageKey = keyof (typeof messages)['en'];

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
