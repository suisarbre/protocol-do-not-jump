import {createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
import {HttpError} from './errors';
import {env, requiredEnv} from './env';
import {clearCookie, parseCookies, serializeCookie} from './cookies';
import type {ApiRequest, Session, SessionUser} from './types';

const SESSION_COOKIE = 'lore_session';
const OAUTH_STATE_COOKIE = 'lore_oauth_state';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
const OAUTH_STATE_TTL_SECONDS = 60 * 10;

export function createOAuthStateCookie(): {state: string; cookie: string} {
  const state = randomBytes(24).toString('base64url');
  return {
    state,
    cookie: serializeCookie(OAUTH_STATE_COOKIE, signValue(state), {
      maxAge: OAUTH_STATE_TTL_SECONDS,
      httpOnly: true,
    }),
  };
}

export function verifyOAuthState(req: ApiRequest, state: string | undefined): void {
  const cookies = parseCookies(req);
  const stored = cookies[OAUTH_STATE_COOKIE];
  if (!state || !stored || verifySignedValue(stored) !== state) {
    throw new HttpError(401, 'invalid_oauth_state', 'GitHub sign-in could not be verified.');
  }
}

export function clearOAuthStateCookie(): string {
  return clearCookie(OAUTH_STATE_COOKIE);
}

export function createSessionCookie(user: SessionUser): string {
  const session: Session = {
    user,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  };
  return serializeCookie(SESSION_COOKIE, signValue(JSON.stringify(session)), {
    maxAge: SESSION_TTL_SECONDS,
    httpOnly: true,
  });
}

export function clearSessionCookie(): string {
  return clearCookie(SESSION_COOKIE);
}

export function getSession(req: ApiRequest): Session | null {
  const cookies = parseCookies(req);
  const signed = cookies[SESSION_COOKIE];
  if (!signed) return null;

  const raw = verifySignedValue(signed);
  if (!raw) return null;

  const session = JSON.parse(raw) as Session;
  if (!session.expiresAt || session.expiresAt < Date.now()) return null;
  return session;
}

export function requireSession(req: ApiRequest): Session {
  const session = getSession(req);
  if (!session) {
    throw new HttpError(401, 'authentication_required', 'Please sign in with GitHub first.');
  }
  return session;
}

function signValue(value: string): string {
  const encoded = Buffer.from(value, 'utf8').toString('base64url');
  const signature = createHmac('sha256', sessionSecret()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifySignedValue(signed: string): string | null {
  const [encoded, signature] = signed.split('.');
  if (!encoded || !signature) return null;

  const expected = createHmac('sha256', sessionSecret()).update(encoded).digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  return Buffer.from(encoded, 'base64url').toString('utf8');
}

function sessionSecret(): string {
  return env('SESSION_SECRET') || requiredEnv('SESSION_SECRET');
}
