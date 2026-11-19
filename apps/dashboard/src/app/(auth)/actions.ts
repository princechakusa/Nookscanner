'use server';

import {
  emailOnlySchema,
  fieldErrors,
  mapAuthError,
  newPasswordSchema,
  safeNextPath,
  signInSchema,
  signUpSchema,
  type AuthFieldErrors,
} from '@nookscanner/shared';
import type { EmailOtpType } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../lib/supabase/server.ts';

export interface AuthFormState {
  status: 'idle' | 'error' | 'sent';
  fieldErrors?: AuthFieldErrors;
  formError?: string;
}

const str = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === 'string' ? v : '';
};

export async function signUpAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse({
    fullName: str(form, 'fullName'),
    email: str(form, 'email'),
    password: str(form, 'password'),
  });
  if (!parsed.success) return { status: 'error', fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    // The confirmation link is built from the Auth site URL in the email template
    // (supabase/templates), never from request headers (host-header injection).
    options: { data: { full_name: parsed.data.fullName } },
  });
  // Supabase returns success for already-registered emails (no enumeration); keep it that way.
  if (error) {
    const code = mapAuthError(error);
    return code === 'WEAK_PASSWORD'
      ? { status: 'error', fieldErrors: { password: code } }
      : { status: 'error', formError: code };
  }
  return { status: 'sent' };
}

export async function signInAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse({
    email: str(form, 'email'),
    password: str(form, 'password'),
  });
  if (!parsed.success) return { status: 'error', fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { status: 'error', formError: mapAuthError(error) };
  redirect(safeNextPath(str(form, 'next')));
}

export async function forgotPasswordAction(
  _prev: AuthFormState,
  form: FormData,
): Promise<AuthFormState> {
  const parsed = emailOnlySchema.safeParse({ email: str(form, 'email') });
  if (!parsed.success) return { status: 'error', fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email);
  // Same answer whether or not the account exists; only rate limiting is surfaced.
  if (error && mapAuthError(error) === 'RATE_LIMITED') {
    return { status: 'error', formError: 'RATE_LIMITED' };
  }
  return { status: 'sent' };
}

export async function resetPasswordAction(
  _prev: AuthFormState,
  form: FormData,
): Promise<AuthFormState> {
  const parsed = newPasswordSchema.safeParse({
    password: str(form, 'password'),
    confirm: str(form, 'confirm'),
  });
  if (!parsed.success) return { status: 'error', fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { status: 'error', formError: mapAuthError(error) };
  redirect('/app?password=updated');
}

const OTP_TYPES: readonly EmailOtpType[] = [
  'email',
  'signup',
  'recovery',
  'invite',
  'email_change',
];

/**
 * Verifies an emailed link. Runs on POST (button click), not on GET, so mail scanners that
 * prefetch links cannot consume the one-time token.
 */
export async function confirmEmailAction(
  _prev: AuthFormState,
  form: FormData,
): Promise<AuthFormState> {
  const tokenHash = str(form, 'token_hash');
  const type = str(form, 'type') as EmailOtpType;
  if (!/^[A-Za-z0-9_-]{8,256}$/.test(tokenHash) || !OTP_TYPES.includes(type)) {
    return { status: 'error', formError: 'LINK_INVALID' };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error)
    return {
      status: 'error',
      formError: mapAuthError(error) === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'LINK_INVALID',
    };
  redirect(type === 'recovery' ? '/reset-password' : safeNextPath(str(form, 'next')));
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
