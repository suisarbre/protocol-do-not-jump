import {z} from 'zod';
import {processDraft} from '../../server/processDraft';
import {consumeCooldown, getCooldowns} from '../../server/rateLimit';
import {generateGeminiText} from '../../server/gemini';
import {findLoreMatches} from '../../server/loreIndex';
import {getQueryValue, method, readJson, sendJson, withApi} from '../../server/http';
import {requireSession} from '../../server/session';
import {isAdmin} from '../../server/admin';
import {HttpError} from '../../server/errors';
import type {ApiRequest, ApiResponse, LoreCitation} from '../../server/types';

const grammarSchema = z.object({
  text: z.string().min(1).max(40_000),
});

const loreCheckSchema = z.object({
  text: z.string().min(1).max(40_000),
  limit: z.number().int().min(1).max(15).optional().default(5),
});

const processSchema = z.object({
  text: z.string().min(1).max(80_000),
  directoryPath: z.string().min(1),
  operation: z.enum(['new', 'edit']),
  targetPath: z.string().optional(),
  baseBlobSha: z.string().optional(),
  skipAi: z.boolean().optional(),
});

const GRAMMAR_SYSTEM_PROMPT = `You are a grammar and style checker for a sci-fi wiki.
Return ONLY a JSON object (no markdown) with this shape:
{"rating":"clean"|"minor"|"major","summary":"one sentence","issues":[{"type":"grammar"|"spelling"|"style","description":"...","suggestion":"..."}]}
In-universe jargon, [REDACTED] tags, and intentional typos used as lore devices are acceptable.`;

const LORE_CHECK_SYSTEM_PROMPT = `You are a lore consistency checker for a collaborative sci-fi wiki.
Given a new draft and excerpts from existing entries, identify factual contradictions only.
Return ONLY JSON: {"conflicts":[{"existingDoc":"title","issue":"description","severity":"minor"|"major"}]}
If no conflicts, return {"conflicts":[]}.`;

type ConflictFinding = {existingDoc: string; issue: string; severity: 'minor' | 'major'};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  await withApi(req, res, async () => {
    method(req, 'POST');
    const session = requireSession(req);
    const action = getQueryValue(req, 'action');

    if (action === 'grammar') {
      const input = grammarSchema.parse(await readJson(req));
      await consumeCooldown('quick', session, req);

      const safeText = `<user_draft>\n${input.text}\n</user_draft>`;
      const raw = await generateGeminiText(GRAMMAR_SYSTEM_PROMPT, safeText);

      if (!raw) {
        sendJson(res, 200, {rating: 'clean', summary: 'No issues found.', issues: [], cooldowns: await getCooldowns(session, req)});
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
      return;
    }

    if (action === 'lore-check') {
      const input = loreCheckSchema.parse(await readJson(req));
      await consumeCooldown('quick', session, req);

      const safeText = `<user_draft>\n${input.text}\n</user_draft>`;
      const matches: LoreCitation[] = await findLoreMatches(input.text, input.limit);
      const highScoreMatches = matches.filter((m) => m.score > 0.35);

      let conflicts: ConflictFinding[] = [];
      let skippedGemini = true;

      if (highScoreMatches.length > 0) {
        skippedGemini = false;
        const excerptBlock = highScoreMatches.map((m) => `--- ${m.title} ---\n${m.excerpt}`).join('\n\n');
        const prompt = `EXISTING ENTRIES:\n${excerptBlock}\n\n${safeText}`;
        const raw = await generateGeminiText(LORE_CHECK_SYSTEM_PROMPT, prompt);
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as {conflicts?: ConflictFinding[]};
            conflicts = parsed.conflicts ?? [];
          } catch {
            conflicts = [];
          }
        }
      }

      sendJson(res, 200, {
        matches,
        conflicts,
        docsChecked: matches.length,
        skippedGemini,
        cooldowns: await getCooldowns(session, req),
      });
      return;
    }

    if (action === 'process') {
      const input = processSchema.parse(await readJson(req));
      if (input.skipAi && !isAdmin(session)) {
        throw new HttpError(403, 'admin_only', 'Skipping AI revision requires admin privileges.');
      }
      await consumeCooldown('quick', session, req);
      const result = await processDraft(input, session);
      sendJson(res, 200, {...result, cooldowns: await getCooldowns(session, req)});
      return;
    }

    res.statusCode = 404;
    res.end();
  });
}
