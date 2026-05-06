import {describe, expect, it} from 'vitest';
import {moderateText} from '../server/moderation';

describe('moderation', () => {
  it('redacts profanity without blocking otherwise allowed text', () => {
    const result = moderateText('The log says shit happened near the relay.');
    expect(result.text).toContain('[REDACTED]');
    expect(result.report.rating).toBe('redacted');
  });

  it('blocks content outside the PG-13 policy', () => {
    const result = moderateText('The entry contains pornographic material.');
    expect(result.report.rating).toBe('blocked');
    expect(result.report.violations).toContain('explicit sexual content');
  });
});
