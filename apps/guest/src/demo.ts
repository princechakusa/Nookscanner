/**
 * DEMO DATA, clearly fictional, served only at /demo for development, design review and E2E
 * screenshots of the guest shell before the Edge Function exists (Phase 9). It is not a real
 * apartment, and no real QR token ever resolves to it.
 */
import { guestExperienceSchema, type GuestExperience } from '@nookscanner/shared';

export const DEMO_EXPERIENCE: GuestExperience = guestExperienceSchema.parse({
  apartment: {
    name: { en: 'Demo apartment', ar: 'شقة تجريبية' },
    property: { en: 'Sample building', ar: 'مبنى تجريبي' },
  },
  rooms: [
    { id: 'living', type: 'living', name: { en: 'Living room', ar: 'غرفة المعيشة' } },
    { id: 'kitchen', type: 'kitchen', name: { en: 'Kitchen', ar: 'المطبخ' } },
    { id: 'bed1', type: 'bedroom', name: { en: 'Bedroom 1', ar: 'غرفة النوم ١' } },
    { id: 'bed2', type: 'bedroom', name: { en: 'Bedroom 2', ar: 'غرفة النوم ٢' } },
  ],
  appliances: [
    {
      id: 'ac-living',
      roomId: 'living',
      category: 'air_conditioner',
      name: { en: 'Living room AC', ar: 'مكيف غرفة المعيشة' },
      aliases: { en: ['ac', 'air conditioner', 'aircon', 'split unit'], ar: ['مكيف', 'تكييف'] },
      brand: 'Example',
      model: 'AC-100',
      verified: true,
      steps: [
        {
          text: {
            en: 'Press the power button on the remote',
            ar: 'اضغط زر التشغيل على جهاز التحكم',
          },
        },
        { text: { en: 'Choose Cool mode (snowflake icon)', ar: 'اختر وضع التبريد (رمز الثلج)' } },
        { text: { en: 'Set the temperature to 22-24 °C', ar: 'اضبط الحرارة بين ٢٢ و٢٤ درجة' } },
        {
          text: { en: 'Use the fan button to change speed', ar: 'استخدم زر المروحة لتغيير السرعة' },
        },
      ],
      troubleshooting: [
        {
          problem: { en: 'Not cooling?', ar: 'المكيف لا يبرّد؟' },
          solution: {
            en: 'Check that Cool mode is selected, close the windows and wait 10 minutes.',
            ar: 'تأكد من اختيار وضع التبريد وأغلق النوافذ وانتظر ١٠ دقائق.',
          },
        },
      ],
    },
    {
      id: 'tv-living',
      roomId: 'living',
      category: 'tv',
      name: { en: 'TV', ar: 'التلفاز' },
      aliases: { en: ['television', 'netflix', 'remote'], ar: ['تلفزيون', 'شاشة'] },
      verified: true,
      steps: [
        {
          text: {
            en: 'Turn on with the red button on the remote',
            ar: 'شغّله بالزر الأحمر في جهاز التحكم',
          },
        },
        { text: { en: 'Press Home and choose an app', ar: 'اضغط الرئيسية واختر تطبيقًا' } },
      ],
      troubleshooting: [],
    },
    {
      id: 'wifi',
      roomId: 'living',
      category: 'router',
      name: { en: 'Wi-Fi router', ar: 'جهاز الواي فاي' },
      aliases: { en: ['wifi', 'internet', 'router', 'password'], ar: ['واي فاي', 'انترنت'] },
      verified: false,
      steps: [
        {
          text: {
            en: 'The network name and password are on the label under the router',
            ar: 'اسم الشبكة وكلمة المرور على الملصق أسفل الجهاز',
          },
        },
      ],
      troubleshooting: [],
    },
    {
      id: 'oven',
      roomId: 'kitchen',
      category: 'oven',
      name: { en: 'Oven', ar: 'الفرن' },
      aliases: { en: ['cooker', 'stove'], ar: ['فرن', 'موقد'] },
      verified: true,
      steps: [
        {
          text: {
            en: 'Turn the left dial to the heating mode',
            ar: 'أدر القرص الأيسر إلى وضع التسخين',
          },
        },
        {
          text: {
            en: 'Turn the right dial to the temperature',
            ar: 'أدر القرص الأيمن إلى درجة الحرارة',
          },
        },
      ],
      troubleshooting: [],
    },
    {
      id: 'ac-bed1',
      roomId: 'bed1',
      category: 'air_conditioner',
      name: { en: 'Bedroom 1 AC', ar: 'مكيف غرفة النوم ١' },
      aliases: { en: ['ac', 'air conditioner', 'aircon'], ar: ['مكيف', 'تكييف'] },
      verified: true,
      steps: [
        {
          text: {
            en: 'Use the wall panel next to the door',
            ar: 'استخدم اللوحة على الجدار بجانب الباب',
          },
        },
      ],
      troubleshooting: [],
    },
  ],
  support: { whatsapp: '10000000000', email: 'support@example.com' },
});
