import {createHash} from 'node:crypto';
import {env} from './env';
import {HttpError} from './errors';
import {clientIp} from './http';
import type {ApiRequest, CooldownKind, CooldownState, Session} from './types';

const cooldownSeconds: Record<CooldownKind, number> = {
  quick: 60,
  submit: 300,
};

const memoryCooldowns = new Map<string, number>();

export async function consumeCooldown(
  kind: CooldownKind,
  session: Session,
  req: ApiRequest,
): Promise<CooldownState> {
  const seconds = cooldownSeconds[kind];
  const keys = cooldownKeys(kind, session, req);

  const states = await Promise.all(keys.map((key) => consumeKey(key, seconds)));
  const limitedState = states.find((state) => state.limited);
  if (limitedState) {
    throw new HttpError(
      429,
      'cooldown_active',
      `Please wait ${limitedState.remainingSeconds} seconds before trying again.`,
    );
  }

  return {limited: false, remainingSeconds: 0, resetAt: Date.now() + seconds * 1000};
}

export async function getCooldowns(session: Session, req: ApiRequest): Promise<Record<CooldownKind, CooldownState>> {
  const entries = await Promise.all(
    (Object.keys(cooldownSeconds) as CooldownKind[]).map(async (kind) => {
      const states = await Promise.all(cooldownKeys(kind, session, req).map((key) => peekKey(key)));
      const limited = states
        .filter((state) => state.limited)
        .sort((a, b) => b.remainingSeconds - a.remainingSeconds)[0];
      return [kind, limited ?? {limited: false, remainingSeconds: 0, resetAt: 0}] as const;
    }),
  );

  return Object.fromEntries(entries) as Record<CooldownKind, CooldownState>;
}

function cooldownKeys(kind: CooldownKind, session: Session, req: ApiRequest): string[] {
  const ipDigest = createHash('sha256').update(clientIp(req)).digest('hex').slice(0, 16);
  return [`cooldown:${kind}:user:${session.user.id}`, `cooldown:${kind}:ip:${ipDigest}`];
}

async function consumeKey(key: string, seconds: number): Promise<CooldownState> {
  if (hasUpstash()) {
    const set = await upstashCommand<string | null>(['SET', key, String(Date.now()), 'EX', seconds, 'NX']);
    if (set === 'OK') {
      return {limited: false, remainingSeconds: 0, resetAt: Date.now() + seconds * 1000};
    }
    return peekKey(key);
  }

  const now = Date.now();
  const expiresAt = memoryCooldowns.get(key) ?? 0;
  if (expiresAt > now) {
    return {
      limited: true,
      remainingSeconds: Math.ceil((expiresAt - now) / 1000),
      resetAt: expiresAt,
    };
  }

  memoryCooldowns.set(key, now + seconds * 1000);
  return {limited: false, remainingSeconds: 0, resetAt: now + seconds * 1000};
}

async function peekKey(key: string): Promise<CooldownState> {
  if (hasUpstash()) {
    const ttl = await upstashCommand<number>(['TTL', key]);
    if (ttl > 0) {
      return {
        limited: true,
        remainingSeconds: ttl,
        resetAt: Date.now() + ttl * 1000,
      };
    }
    return {limited: false, remainingSeconds: 0, resetAt: 0};
  }

  const expiresAt = memoryCooldowns.get(key) ?? 0;
  const remaining = Math.ceil((expiresAt - Date.now()) / 1000);
  if (remaining > 0) {
    return {limited: true, remainingSeconds: remaining, resetAt: expiresAt};
  }
  return {limited: false, remainingSeconds: 0, resetAt: 0};
}

function hasUpstash(): boolean {
  return Boolean(env('UPSTASH_REDIS_REST_URL') && env('UPSTASH_REDIS_REST_TOKEN'));
}

async function upstashCommand<T>(command: unknown[]): Promise<T> {
  const response = await fetch(env('UPSTASH_REDIS_REST_URL'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env('UPSTASH_REDIS_REST_TOKEN')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });

  if (!response.ok) {
    throw new Error(`Upstash request failed with ${response.status}`);
  }

  const payload = (await response.json()) as {result: T; error?: string};
  if (payload.error) {
    throw new Error(payload.error);
  }
  return payload.result;
}
