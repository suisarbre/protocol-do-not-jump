import {createHash} from 'node:crypto';
import {env} from './env';

const textModel = 'gemini-2.5-flash';
const embeddingModel = 'gemini-embedding-001';

export async function generateGeminiText(systemInstruction: string, prompt: string): Promise<string | null> {
  const apiKey = env('GEMINI_API_KEY');
  if (!apiKey) return null;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${textModel}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        systemInstruction: {parts: [{text: systemInstruction}]},
        contents: [{role: 'user', parts: [{text: prompt}]}],
        generationConfig: {
          temperature: 0.45,
          topP: 0.9,
          responseMimeType: 'text/plain',
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini request failed with ${response.status}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{content?: {parts?: Array<{text?: string}>}}>;
  };
  return payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim() || null;
}

export async function embedText(text: string): Promise<number[]> {
  const apiKey = env('GEMINI_API_KEY');
  if (!apiKey) return deterministicEmbedding(text);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${embeddingModel}:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        model: `models/${embeddingModel}`,
        content: {parts: [{text: text.slice(0, 12000)}]},
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini embedding request failed with ${response.status}`);
  }

  const payload = (await response.json()) as {embedding?: {values?: number[]}};
  return payload.embedding?.values ?? deterministicEmbedding(text);
}

export function deterministicEmbedding(text: string, dimensions = 32): number[] {
  const values: number[] = [];
  let seed = text;
  while (values.length < dimensions) {
    const digest = createHash('sha256').update(seed).digest();
    for (const byte of digest) {
      values.push(byte / 127.5 - 1);
      if (values.length === dimensions) break;
    }
    seed = digest.toString('hex');
  }
  return values;
}
