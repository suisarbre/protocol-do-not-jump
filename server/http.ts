import {HttpError, isHttpError} from './errors';
import {csvEnv} from './env';
import type {ApiRequest, ApiResponse} from './types';

export async function readJson<T = unknown>(req: ApiRequest): Promise<T> {
  if (req.body && typeof req.body === 'object') {
    return req.body as T;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {} as T;
  }

  return JSON.parse(raw) as T;
}

export function getQueryValue(req: ApiRequest, key: string): string | undefined {
  const value = req.query?.[key];
  if (Array.isArray(value)) return value[0];
  if (typeof value === 'string') return value;

  const host = req.headers.host ?? 'localhost';
  const url = new URL(req.url ?? '/', `http://${host}`);
  return url.searchParams.get(key) ?? undefined;
}

export function applyCors(req: ApiRequest, res: ApiResponse): void {
  const origin = req.headers.origin;
  const allowedOrigins = csvEnv('ALLOWED_ORIGINS');
  const allowAnyLocalhost =
    !allowedOrigins.length && origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

  if (origin && (allowedOrigins.includes(origin) || allowAnyLocalhost)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
}

export function sendJson(res: ApiResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export function sendError(res: ApiResponse, error: unknown): void {
  if (isHttpError(error)) {
    sendJson(res, error.status, {error: error.code, message: error.message});
    return;
  }

  const message = error instanceof Error ? error.message : 'Unexpected server error';
  sendJson(res, 500, {error: 'server_error', message});
}

export async function withApi(
  req: ApiRequest,
  res: ApiResponse,
  handler: () => Promise<void>,
): Promise<void> {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    await handler();
  } catch (error) {
    sendError(res, error);
  }
}

export function method(req: ApiRequest, expected: string): void {
  if (req.method !== expected) {
    throw new HttpError(405, 'method_not_allowed', `Expected ${expected}.`);
  }
}

export function clientIp(req: ApiRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]!.trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(',')[0]!.trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}
