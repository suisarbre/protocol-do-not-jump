import type {ApiRequest} from './types';

export function parseCookies(req: ApiRequest): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};

  return Object.fromEntries(
    header.split(';').map((part) => {
      const [rawKey, ...rawValue] = part.trim().split('=');
      return [decodeURIComponent(rawKey ?? ''), decodeURIComponent(rawValue.join('='))];
    }),
  );
}

export type CookieOptions = {
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Lax' | 'Strict' | 'None';
  path?: string;
};

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path ?? '/'}`);
  if (typeof options.maxAge === 'number') parts.push(`Max-Age=${options.maxAge}`);
  if (options.httpOnly ?? true) parts.push('HttpOnly');
  if (options.secure ?? process.env.NODE_ENV === 'production') parts.push('Secure');
  parts.push(`SameSite=${options.sameSite ?? cookieSameSite()}`);
  return parts.join('; ');
}

export function clearCookie(name: string): string {
  return serializeCookie(name, '', {maxAge: 0});
}

function cookieSameSite(): 'Lax' | 'Strict' | 'None' {
  const value = (process.env.COOKIE_SAME_SITE ?? 'Lax').toLowerCase();
  if (value === 'none') return 'None';
  if (value === 'strict') return 'Strict';
  return 'Lax';
}
