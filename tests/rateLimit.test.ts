import {describe, expect, it} from 'vitest';
import {consumeCooldown} from '../server/rateLimit';
import type {ApiRequest, Session} from '../server/types';

describe('cooldowns', () => {
  it('enforces quick action cooldowns by user and IP', async () => {
    const session: Session = {
      user: {id: Math.floor(Math.random() * 10_000_000), login: 'writer'},
      expiresAt: Date.now() + 1000,
    };
    const req = {
      headers: {'x-forwarded-for': '203.0.113.10'},
      socket: {},
    } as unknown as ApiRequest;

    await expect(consumeCooldown('quick', session, req)).resolves.toMatchObject({limited: false});
    await expect(consumeCooldown('quick', session, req)).rejects.toThrow(/Please wait/);
  });
});
