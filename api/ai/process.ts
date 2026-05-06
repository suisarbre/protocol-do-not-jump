import {z} from 'zod';
import {processDraft} from '../../server/processDraft';
import {consumeCooldown, getCooldowns} from '../../server/rateLimit';
import {method, readJson, sendJson, withApi} from '../../server/http';
import {requireSession} from '../../server/session';
import type {ApiRequest, ApiResponse} from '../../server/types';

const processSchema = z.object({
  text: z.string().min(1).max(80_000),
  directoryPath: z.string().min(1),
  operation: z.enum(['new', 'edit']),
  targetPath: z.string().optional(),
  baseBlobSha: z.string().optional(),
});

export default async function handler(req: ApiRequest, res: ApiResponse) {
  await withApi(req, res, async () => {
    method(req, 'POST');
    const session = requireSession(req);
    const input = processSchema.parse(await readJson(req));
    await consumeCooldown('quick', session, req);
    const result = await processDraft(input, session);

    sendJson(res, 200, {
      ...result,
      cooldowns: await getCooldowns(session, req),
    });
  });
}
