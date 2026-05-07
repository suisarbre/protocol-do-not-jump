import {z} from 'zod';
import {consumeCooldown, getCooldowns} from '../../server/rateLimit';
import {method, readJson, sendJson, withApi} from '../../server/http';
import {requireSession} from '../../server/session';
import {generateGeminiText} from '../../server/gemini';
import {findLoreMatches} from '../../server/loreIndex';
import type {ApiRequest, ApiResponse, LoreCitation} from '../../server/types';

const schema = z.object({
  text: z.string().min(1).max(40_000),
  limit: z.number().int().min(1).max(15).optional().default(5),
});

const SYSTEM_PROMPT = `You are a lore consistency checker for a collaborative sci-fi wiki.
Given a new draft and excerpts from existing entries, identify factual contradictions only.
Return ONLY JSON: {"conflicts":[{"existingDoc":"title","issue":"description","severity":"minor"|"major"}]}
If no conflicts, return {"conflicts":[]}.`;

type ConflictFinding = {
  existingDoc: string;
  issue: string;
  severity: 'minor' | 'major';
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  await withApi(req, res, async () => {
    method(req, 'POST');
    const session = requireSession(req);
    const input = schema.parse(await readJson(req));
    await consumeCooldown('quick', session, req);

    const safeText = `<user_draft>\n${input.text}\n</user_draft>`;
    const matches: LoreCitation[] = await findLoreMatches(input.text, input.limit);
    const highScoreMatches = matches.filter((m) => m.score > 0.35);

    let conflicts: ConflictFinding[] = [];
    let skippedGemini = true;

    if (highScoreMatches.length > 0) {
      skippedGemini = false;
      const excerptBlock = highScoreMatches
        .map((m) => `--- ${m.title} ---\n${m.excerpt}`)
        .join('\n\n');
      const prompt = `EXISTING ENTRIES:\n${excerptBlock}\n\n${safeText}`;
      const raw = await generateGeminiText(SYSTEM_PROMPT, prompt);

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
  });
}
