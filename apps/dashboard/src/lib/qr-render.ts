import { parseGuestBaseUrl } from '@nookscanner/shared';
import QRCode from 'qrcode';

/**
 * Print-ready QR rendering (server side). Error correction "M" (15 %) survives light wear and
 * glare on a printed sticker; a 4-module quiet zone is the minimum the QR spec requires.
 */
const OPTIONS = { errorCorrectionLevel: 'M', margin: 4 } as const;

export async function renderQrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    ...OPTIONS,
    type: 'svg',
    color: { dark: '#000000', light: '#ffffff' },
  });
}

/** 1024 px PNG: about 30 px per module, sharp when printed up to ~8 cm at 300 dpi. */
export async function renderQrPng(text: string): Promise<Buffer> {
  return QRCode.toBuffer(text, { ...OPTIONS, type: 'png', width: 1024 });
}

/**
 * Base URL of the guest app that QR codes point to. `NEXT_PUBLIC_GUEST_URL` must be set outside
 * local development; locally it defaults to the guest dev server.
 */
export function guestBaseUrl(): string | null {
  const configured = parseGuestBaseUrl(process.env.NEXT_PUBLIC_GUEST_URL);
  if (configured) return configured;
  return process.env.NEXT_PUBLIC_APP_ENV === 'local' ? 'http://localhost:5173' : null;
}
