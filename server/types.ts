import type {IncomingMessage, ServerResponse} from 'node:http';

export type ApiRequest = IncomingMessage & {
  query?: Record<string, string | string[]>;
  body?: unknown;
  cookies?: Record<string, string>;
};

export type ApiResponse = ServerResponse & {
  status?: (statusCode: number) => ApiResponse;
  json?: (body: unknown) => void;
  redirect?: (statusOrUrl: number | string, url?: string) => void;
};

export type SessionUser = {
  id: number;
  login: string;
  name?: string;
  avatarUrl?: string;
};

export type Session = {
  user: SessionUser;
  expiresAt: number;
};

export type CooldownKind = 'quick' | 'submit';

export type CooldownState = {
  limited: boolean;
  remainingSeconds: number;
  resetAt: number;
};

export type LoreCitation = {
  path: string;
  title: string;
  score: number;
  excerpt: string;
};

export type ModerationReport = {
  redactions: Array<{term: string; count: number}>;
  violations: string[];
  rating: 'clean' | 'redacted' | 'blocked';
};

export type RiskLevel = 'low' | 'medium' | 'high';
