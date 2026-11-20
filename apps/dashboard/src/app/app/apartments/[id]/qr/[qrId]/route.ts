import { guestQrUrl, qrFileName } from '@nookscanner/shared';
import { z } from 'zod';
import { guestBaseUrl, renderQrPng, renderQrSvg } from '../../../../../../lib/qr-render.ts';
import { IMAGE_CSP } from '../../../../../../lib/routes.ts';
import { createSupabaseServerClient } from '../../../../../../lib/supabase/server.ts';

/**
 * GET /app/apartments/<id>/qr/<qrId>?format=svg|png[&download=1]
 * Print-ready QR image for an active code. Readable only with `qr.manage` (RLS on qr_codes);
 * unknown, other-org and revoked codes all answer 404 (no oracle). Never cached.
 */
const notFound = () =>
  new Response('Not found', {
    status: 404,
    headers: { 'Cache-Control': 'private, no-store', 'Content-Type': 'text/plain' },
  });

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; qrId: string }> },
) {
  const p = await params;
  const ids = z.object({ id: z.uuid(), qrId: z.uuid() }).safeParse(p);
  const search = new URL(request.url).searchParams;
  const format = z.enum(['svg', 'png']).safeParse(search.get('format') ?? 'svg');
  if (!ids.success || !format.success) return notFound();

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('qr_codes')
    .select('token, label, status, apartments(name)')
    .eq('id', ids.data.qrId)
    .eq('apartment_id', ids.data.id)
    .maybeSingle();
  const qr = data as {
    token: string;
    label: string | null;
    status: string;
    apartments: { name: string } | null;
  } | null;
  const base = guestBaseUrl();
  if (!qr || qr.status !== 'active' || !base) return notFound();

  const url = guestQrUrl(base, qr.token);
  const name = qrFileName(qr.apartments?.name ?? '', qr.label, format.data);
  const headers: Record<string, string> = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    // Even if the SVG is opened directly, nothing in it may run or load (the proxy sets the
    // same policy for this route; see lib/routes.ts).
    'Content-Security-Policy': IMAGE_CSP,
    'Content-Disposition': `${search.get('download') === '1' ? 'attachment' : 'inline'}; filename="${name}"`,
  };
  if (format.data === 'png') {
    const png = await renderQrPng(url);
    return new Response(new Uint8Array(png), {
      headers: { ...headers, 'Content-Type': 'image/png' },
    });
  }
  return new Response(await renderQrSvg(url), {
    headers: { ...headers, 'Content-Type': 'image/svg+xml; charset=utf-8' },
  });
}
