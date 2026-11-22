/** Cloudflare runtime binding for the uploads Worker (logic in handler.ts). */
import { handle, type R2Like } from './handler.ts';

interface Env {
  RAW: R2Like;
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  ALLOWED_ORIGINS: string;
  R2_RECEIPT_SECRET: string;
  RAW_READ_SECRET: string;
}

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    return handle(req, {
      raw: env.RAW,
      supabaseUrl: env.SUPABASE_URL,
      publishableKey: env.SUPABASE_PUBLISHABLE_KEY,
      receiptSecret: env.R2_RECEIPT_SECRET,
      readSecret: env.RAW_READ_SECRET,
      allowedOrigins: env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()),
      fetch: (input, init) => fetch(input, init),
    });
  },
};
