import { describe, expect, it } from 'vitest';
import { looksLikePrivilegedKey, parsePublicEnv } from './env.ts';

function fakeJwt(role: string): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role, iss: 'supabase' })}.signature`;
}

describe('public env validation', () => {
  it('accepts an anon key', () => {
    const env = parsePublicEnv({
      appEnv: 'local',
      supabaseUrl: 'http://127.0.0.1:54321',
      supabaseAnonKey: fakeJwt('anon'),
    });
    expect(env.appEnv).toBe('local');
  });

  it('accepts a publishable key', () => {
    expect(() =>
      parsePublicEnv({
        appEnv: 'staging',
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: 'sb_publishable_abcdefghijklmnop',
      }),
    ).not.toThrow();
  });

  it('rejects a service-role JWT in public config', () => {
    expect(() =>
      parsePublicEnv({
        appEnv: 'local',
        supabaseUrl: 'http://127.0.0.1:54321',
        supabaseAnonKey: fakeJwt('service_role'),
      }),
    ).toThrow(/privileged/);
  });

  it('rejects a secret key in public config', () => {
    expect(looksLikePrivilegedKey('sb_secret_abc123')).toBe(true);
  });

  it('requires https in production', () => {
    expect(() =>
      parsePublicEnv({
        appEnv: 'production',
        supabaseUrl: 'http://example.supabase.co',
        supabaseAnonKey: fakeJwt('anon'),
      }),
    ).toThrow(/https/);
  });

  it('rejects missing values', () => {
    expect(() =>
      parsePublicEnv({ appEnv: undefined, supabaseUrl: undefined, supabaseAnonKey: undefined }),
    ).toThrow(/Invalid public environment/);
  });
});
