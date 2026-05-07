import {z} from 'zod';
import {consumeCooldown, getCooldowns} from '../../server/rateLimit';
import {method, readJson, sendJson, withApi} from '../../server/http';
import {requireSession} from '../../server/session';
import {generateGeminiText} from '../../server/gemini';
import type {ApiRequest, ApiResponse} from '../../server/types';

const schema = z.object({
  text: z.string().min(1).max(40_000),
});

const SYSTEM_PROMPT = `You are a grammar and style checker for a sci-fi wiki.
Return ONLY a JSON object (no markdown) with this shape:
{"rating":"clean"|"minor"|"major","summary":"one sentence","issues":[{"type":"grammar"|"spelling"|"style","description":"...","suggestion":"..."}]}
In-universe jargon, [REDACTED] tags, and intentional typos used as lore devices are acceptable.`;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  await withApi(req, res, async () => {
    method(req, 'POST');
    const session = requireSession(req);
    const input = schema.parse(await readJson(req));
    await consumeCooldown('quick', session, req);

    const raw = await generateGeminiText(SYSTEM_PROMPT, input.text);

    if (!raw) {
      sendJson(res, 200, {
        rating: 'clean',
        summary: 'No issues found.',
        issues: [],
        cooldowns: await getCooldowns(session, req),
      });
      return;
    }

    let parsed: {rating: string; summary: string; issues: unknown[]};
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      parsed = {rating: 'clean', summary: raw, issues: []};
    }

    sendJson(res, 200, {
      rating: parsed.rating ?? 'clean',
      summary: parsed.summary ?? '',
      issues: parsed.issues ?? [],
      cooldowns: await getCooldowns(session, req),
    });
  });
}
