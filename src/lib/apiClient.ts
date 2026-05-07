import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

export type SessionResponse = {
  authenticated: boolean;
  user: null | {
    id: number;
    login: string;
    name?: string;
    avatarUrl?: string;
  };
  isAdmin: boolean;
  cooldowns: CooldownMap | null;
};

export type CooldownMap = {
  quick: CooldownState;
  submit: CooldownState;
};

export type CooldownState = {
  limited: boolean;
  remainingSeconds: number;
  resetAt: number;
};

export type ProcessResponse = {
  formattedMarkdown: string;
  title: string;
  slug: string;
  targetPath: string;
  moderation: {
    redactions: Array<{term: string; count: number}>;
    violations: string[];
    rating: 'clean' | 'redacted' | 'blocked';
  };
  loreFindings: Array<{path: string; title: string; score: number; excerpt: string}>;
  riskLevel: 'low' | 'medium' | 'high';
  directoryRulesPath: string;
  cooldowns: CooldownMap;
};

export type SubmitResponse = {
  pullRequestUrl: string;
  pullRequestNumber: number;
  targetPath: string;
  mergeStatus: 'queued_for_safe_automerge' | 'requires_admin_review';
  riskLevel: 'low' | 'medium' | 'high';
  reasons: string[];
  cooldowns: CooldownMap;
};

export type WikiTreeResponse = {
  directories: WikiDirectory[];
};

export type WikiDirectory = {
  path: string;
  name: string;
  hasRules: boolean;
  rulesPath?: string;
  files: Array<{
    path: string;
    title: string;
    sha?: string;
    kind: 'rules' | 'document';
    editable: boolean;
  }>;
};

export type DirectoryRulesResponse = {
  directoryPath: string;
  rulesPath: string;
  sha?: string;
  content: string;
  exists: boolean;
};

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function useApiBaseUrl(): string {
  const {siteConfig} = useDocusaurusContext();
  return String(siteConfig.customFields?.apiBaseUrl ?? '').replace(/\/$/, '');
}

export function apiUrl(apiBaseUrl: string, path: string): string {
  return `${apiBaseUrl}${path}`;
}

export async function apiRequest<T>(
  apiBaseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(apiUrl(apiBaseUrl, path), {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const payload = await safeJson(response);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      String(payload?.error ?? 'request_failed'),
      String(payload?.message ?? 'Request failed.'),
    );
  }
  if (payload === null) {
    throw new ApiError(response.status, 'invalid_response', 'The API returned a non-JSON response.');
  }
  return payload as T;
}

async function safeJson(response: Response): Promise<Record<string, unknown> | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}
