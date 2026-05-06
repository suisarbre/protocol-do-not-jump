import React, {useEffect, useMemo, useState} from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileDown,
  FolderGit2,
  Github,
  GitPullRequest,
  Loader2,
  LogOut,
  PencilLine,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  ApiError,
  apiRequest,
  apiUrl,
  type CooldownMap,
  type DirectoryRulesResponse,
  type ProcessResponse,
  type SessionResponse,
  type SubmitResponse,
  type WikiDirectory,
  type WikiTreeResponse,
  useApiBaseUrl,
} from '../lib/apiClient';

type Operation = 'new' | 'edit';

const emptyDraft = [
  'An archival probe recovered fragments from a trade relay near the Asterion Verge.',
  'The fragments reference a private security fleet, an unpaid debt treaty, and a signal that repeats every 41 hours.',
].join('\n\n');

const defaultNewDirectory = 'docs/BBB internal documents';

export default function ContributorApp(): JSX.Element {
  const apiBaseUrl = useApiBaseUrl();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [tree, setTree] = useState<WikiDirectory[]>([]);
  const [selectedDirectory, setSelectedDirectory] = useState(defaultNewDirectory);
  const [newDirectoryPath, setNewDirectoryPath] = useState(defaultNewDirectory);
  const [directoryRules, setDirectoryRules] = useState<DirectoryRulesResponse | null>(null);
  const [rulesDraft, setRulesDraft] = useState('');
  const [operation, setOperation] = useState<Operation>('new');
  const [draft, setDraft] = useState(emptyDraft);
  const [processed, setProcessed] = useState<ProcessResponse | null>(null);
  const [editPath, setEditPath] = useState('docs/BBB internal documents/20XX_X_25_Receipt.md');
  const [loadedSha, setLoadedSha] = useState<string | undefined>();
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<
    'session' | 'rules' | 'load' | 'process' | 'submit' | 'saveRules' | 'logout' | null
  >('session');
  const [cooldowns, setCooldowns] = useState<CooldownMap | null>(null);
  const now = useTicker(1000);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<SessionResponse>(apiBaseUrl, '/api/session', {method: 'GET'}).catch(() => ({
        authenticated: false,
        user: null,
        cooldowns: null,
      })),
      apiRequest<WikiTreeResponse>(apiBaseUrl, '/api/wiki/tree', {method: 'GET'}).catch(() => ({
        directories: [],
      })),
    ])
      .then(async ([sessionPayload, treePayload]) => {
        const directories = await hydrateTreeFallback(treePayload.directories);
        if (!active) return;
        setSession(sessionPayload);
        setCooldowns(sessionPayload.cooldowns);
        setTree(directories);

        const firstEditable =
          directories.find((directory) => directory.hasRules) ??
          directories.find((directory) => !directory.path.startsWith('docs/canon'));
        if (firstEditable) {
          setSelectedDirectory(firstEditable.path);
          setNewDirectoryPath(firstEditable.path);
        }
      })
      .finally(() => {
        if (active) setBusy(null);
      });

    return () => {
      active = false;
    };
  }, [apiBaseUrl]);

  useEffect(() => {
    if (!selectedDirectory) return;
    let active = true;
    setBusy((current) => current ?? 'rules');
    apiRequest<DirectoryRulesResponse>(
      apiBaseUrl,
      `/api/wiki/directory?path=${encodeURIComponent(selectedDirectory)}`,
      {method: 'GET'},
    )
      .catch(() => defaultRulesForDirectory(selectedDirectory))
      .then((payload) => {
        if (!active) return;
        setDirectoryRules(payload);
        setRulesDraft(payload.content);
      })
      .catch((err) => {
        if (!active) return;
        setDirectoryRules(null);
        setRulesDraft('');
        setError(messageFromError(err));
      })
      .finally(() => {
        if (active) setBusy((current) => (current === 'rules' ? null : current));
      });

    return () => {
      active = false;
    };
  }, [apiBaseUrl, selectedDirectory]);

  const quickRemaining = remaining(cooldowns?.quick.resetAt, now);
  const submitRemaining = remaining(cooldowns?.submit.resetAt, now);
  const isAuthenticated = Boolean(session?.authenticated);
  const canProcess = isAuthenticated && draft.trim().length > 0 && quickRemaining === 0 && busy !== 'process';
  const canSubmit =
    isAuthenticated &&
    Boolean(processed?.formattedMarkdown) &&
    submitRemaining === 0 &&
    busy !== 'submit';
  const canSaveRules =
    isAuthenticated &&
    rulesDraft.trim().length > 0 &&
    submitRemaining === 0 &&
    busy !== 'saveRules';

  const reviewState = useMemo(() => {
    if (!processed) return null;
    if (processed.riskLevel === 'high') return {label: 'Admin review required', tone: 'danger'};
    if (processed.riskLevel === 'medium') return {label: 'Review recommended', tone: 'warn'};
    return {label: 'Safe auto-merge candidate', tone: 'good'};
  }, [processed]);

  async function refreshAll() {
    const [sessionPayload, treePayload] = await Promise.all([
      apiRequest<SessionResponse>(apiBaseUrl, '/api/session', {method: 'GET'}).catch(() => ({
        authenticated: false,
        user: null,
        cooldowns: null,
      })),
      apiRequest<WikiTreeResponse>(apiBaseUrl, '/api/wiki/tree', {method: 'GET'}).catch(() => ({
        directories: [],
      })),
    ]);
    setSession(sessionPayload);
    setCooldowns(sessionPayload.cooldowns);
    setTree(await hydrateTreeFallback(treePayload.directories));
  }

  function selectDirectory(directoryPath: string) {
    setSelectedDirectory(directoryPath);
    setNewDirectoryPath(directoryPath);
    setProcessed(null);
    if (operation === 'edit' && !editPath.startsWith(`${directoryPath}/`)) {
      setEditPath(`${directoryPath}/`);
    }
  }

  function createDirectoryDraft() {
    const normalized = newDirectoryPath.trim().replace(/\\/g, '/').replace(/\/+$/, '');
    if (!normalized) return;
    setSelectedDirectory(normalized);
    setNewDirectoryPath(normalized);
    setOperation('new');
    setProcessed(null);
    setStatus(`Directory selected: ${normalized}`);
  }

  async function loadExisting(path?: string) {
    const target = path ?? editPath;
    setBusy('load');
    setError('');
    setStatus('');
    try {
      const file = await apiRequest<{path: string; sha: string; content: string}>(
        apiBaseUrl,
        `/api/wiki/file?path=${encodeURIComponent(target)}`,
        {method: 'GET'},
      );
      setOperation('edit');
      setEditPath(file.path);
      setDraft(file.content);
      setLoadedSha(file.sha);
      setProcessed(null);
      setStatus(`Loaded ${file.path}`);
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setBusy(null);
    }
  }

  async function processDraft() {
    setBusy('process');
    setError('');
    setStatus('');
    try {
      const result = await apiRequest<ProcessResponse>(apiBaseUrl, '/api/ai/process', {
        method: 'POST',
        body: JSON.stringify({
          text: draft,
          directoryPath: selectedDirectory,
          operation,
          targetPath: operation === 'edit' ? editPath : undefined,
          baseBlobSha: loadedSha,
        }),
      });
      setProcessed(result);
      setCooldowns(result.cooldowns);
      setStatus(`Draft processed using ${result.directoryRulesPath}.`);
    } catch (err) {
      setError(messageFromError(err));
      await refreshAll().catch(() => undefined);
    } finally {
      setBusy(null);
    }
  }

  async function submitDraft() {
    if (!processed) return;
    setBusy('submit');
    setError('');
    setStatus('');
    try {
      const result = await apiRequest<SubmitResponse>(apiBaseUrl, '/api/submissions', {
        method: 'POST',
        body: JSON.stringify({
          operation,
          markdown: processed.formattedMarkdown,
          targetPath: processed.targetPath,
          baseBlobSha: loadedSha,
        }),
      });
      setCooldowns(result.cooldowns);
      setStatus(`PR #${result.pullRequestNumber} opened: ${result.mergeStatus.replaceAll('_', ' ')}`);
    } catch (err) {
      setError(messageFromError(err));
      await refreshAll().catch(() => undefined);
    } finally {
      setBusy(null);
    }
  }

  async function saveRules() {
    setBusy('saveRules');
    setError('');
    setStatus('');
    try {
      const result = await apiRequest<{
        pullRequestNumber: number;
        rulesPath: string;
        cooldowns: CooldownMap;
      }>(apiBaseUrl, '/api/directories', {
        method: 'POST',
        body: JSON.stringify({
          directoryPath: selectedDirectory,
          rulesPath: directoryRules?.rulesPath ?? `${selectedDirectory}/formats.md`,
          markdown: rulesDraft,
          baseBlobSha: directoryRules?.sha,
        }),
      });
      setCooldowns(result.cooldowns);
      setStatus(`Directory rules PR #${result.pullRequestNumber} opened for ${result.rulesPath}.`);
    } catch (err) {
      setError(messageFromError(err));
      await refreshAll().catch(() => undefined);
    } finally {
      setBusy(null);
    }
  }

  async function logout() {
    setBusy('logout');
    try {
      await apiRequest(apiBaseUrl, '/api/auth/logout', {method: 'POST'});
      setSession({authenticated: false, user: null, cooldowns: null});
      setCooldowns(null);
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="contributorDesk">
      <section className="deskMast">
        <div>
          <p className="deskKicker">Collaborative Lore Console</p>
          <h1>Lore Wiki</h1>
          <p className="deskLead">
            Browse lore directories, edit local format rules, and submit documents into the archive.
          </p>
        </div>
        <div className="sessionPanel">
          {busy === 'session' ? (
            <span className="inlineStatus">
              <Loader2 className="spinIcon" size={16} /> Checking session
            </span>
          ) : isAuthenticated ? (
            <>
              {session?.user?.avatarUrl ? <img className="avatar" src={session.user.avatarUrl} alt="" /> : null}
              <div className="sessionText">
                <span>Signed in</span>
                <strong>@{session?.user?.login}</strong>
              </div>
              <button className="iconButton" type="button" onClick={logout} title="Sign out">
                {busy === 'logout' ? <Loader2 className="spinIcon" size={18} /> : <LogOut size={18} />}
              </button>
            </>
          ) : (
            <a className="primaryButton" href={apiUrl(apiBaseUrl, '/api/auth/github/start')}>
              <Github size={18} />
              Sign in with GitHub
            </a>
          )}
        </div>
      </section>

      <section className="archiveSurface" aria-label="Lore workspace">
        <aside className="directoryColumn" aria-label="Lore directories">
          <div className="panelHeader">
            <p className="deskKicker">Directories</p>
            <button className="ghostButton" type="button" onClick={() => void refreshAll()}>
              <RefreshCw size={16} />
              Sync
            </button>
          </div>
          <div className="newDirectoryRow">
            <input
              value={newDirectoryPath}
              onChange={(event) => setNewDirectoryPath(event.target.value)}
              aria-label="New or existing lore directory path"
            />
            <button className="secondaryButton" type="button" onClick={createDirectoryDraft}>
              <FolderGit2 size={16} />
              Use
            </button>
          </div>
          <div className="directoryList">
            {tree.map((directory) => (
              <div className="directoryBlock" key={directory.path}>
                <button
                  type="button"
                  className={selectedDirectory === directory.path ? 'directoryButton active' : 'directoryButton'}
                  onClick={() => selectDirectory(directory.path)}
                >
                  <FolderGit2 size={16} />
                  <span>{directory.name}</span>
                  <em>{directory.hasRules ? 'rules' : 'no rules'}</em>
                </button>
                {selectedDirectory === directory.path ? (
                  <div className="fileList">
                    {directory.files.map((file) => (
                      <button
                        type="button"
                        key={file.path}
                        onClick={() => {
                          if (file.kind === 'rules') {
                            setDirectoryRules((current) =>
                              current ? {...current, rulesPath: file.path} : current,
                            );
                          } else {
                            void loadExisting(file.path);
                          }
                        }}
                      >
                        <PencilLine size={14} />
                        <span>{file.title}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </aside>

        <div className="editorColumn">
          <div className="toolbarRow">
            <div className="segmented" aria-label="Operation">
              <button type="button" className={operation === 'new' ? 'active' : ''} onClick={() => setOperation('new')}>
                New
              </button>
              <button type="button" className={operation === 'edit' ? 'active' : ''} onClick={() => setOperation('edit')}>
                Edit
              </button>
            </div>
            <div className="selectedDirectory">
              <FolderGit2 size={16} />
              <span>{selectedDirectory}</span>
            </div>
          </div>

          {operation === 'edit' ? (
            <div className="loadRow">
              <input
                value={editPath}
                onChange={(event) => setEditPath(event.target.value)}
                aria-label="Existing non-core document path"
              />
              <button className="secondaryButton" type="button" onClick={() => void loadExisting()} disabled={!isAuthenticated}>
                {busy === 'load' ? <Loader2 className="spinIcon" size={16} /> : <FileDown size={16} />}
                Load
              </button>
            </div>
          ) : null}

          <textarea
            className="draftEditor"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setProcessed(null);
            }}
            aria-label="Draft Markdown"
            spellCheck
          />

          <div className="actionRow">
            <button className="primaryButton" type="button" onClick={processDraft} disabled={!canProcess}>
              {busy === 'process' ? <Loader2 className="spinIcon" size={18} /> : <Sparkles size={18} />}
              {quickRemaining ? `Process in ${quickRemaining}s` : 'Process'}
            </button>
            <button className="secondaryButton" type="button" onClick={submitDraft} disabled={!canSubmit}>
              {busy === 'submit' ? <Loader2 className="spinIcon" size={18} /> : <Send size={18} />}
              {submitRemaining ? `Submit in ${submitRemaining}s` : 'Submit PR'}
            </button>
          </div>

          {status ? (
            <p className="notice good">
              <CheckCircle2 size={16} /> {status}
            </p>
          ) : null}
          {error ? (
            <p className="notice danger">
              <AlertTriangle size={16} /> {error}
            </p>
          ) : null}

          <div className="rulesEditor">
            <div className="panelHeader">
              <div>
                <p className="deskKicker">Directory Rules</p>
                <h2>{directoryRules?.rulesPath ?? `${selectedDirectory}/formats.md`}</h2>
              </div>
              <button className="secondaryButton" type="button" onClick={saveRules} disabled={!canSaveRules}>
                {busy === 'saveRules' ? <Loader2 className="spinIcon" size={16} /> : <Save size={16} />}
                {submitRemaining ? `Save in ${submitRemaining}s` : 'Save Rules PR'}
              </button>
            </div>
            <textarea
              className="rulesTextArea"
              value={rulesDraft}
              onChange={(event) => setRulesDraft(event.target.value)}
              aria-label="Directory formatting rules"
            />
          </div>
        </div>

        <aside className="reviewColumn" aria-label="Review output">
          <div className="reviewHeader">
            <div>
              <p className="deskKicker">Review</p>
              <h2>{processed?.title ?? 'Processed document'}</h2>
            </div>
            {reviewState ? <span className={`riskPill ${reviewState.tone}`}>{reviewState.label}</span> : null}
          </div>

          <div className="reviewMeta">
            <span>
              <GitPullRequest size={15} /> {processed?.targetPath ?? 'No target path yet'}
            </span>
            <span>
              <ShieldCheck size={15} /> {processed?.moderation.rating ?? 'pending'}
            </span>
          </div>

          <textarea
            className="reviewEditor"
            value={processed?.formattedMarkdown ?? ''}
            onChange={(event) =>
              setProcessed((current) =>
                current ? {...current, formattedMarkdown: event.target.value} : current,
              )
            }
            aria-label="Processed Markdown"
            placeholder="Processed Markdown will appear here."
          />

          <div className="findingList">
            <h3>Lore matches</h3>
            {processed?.loreFindings.length ? (
              processed.loreFindings.map((finding) => (
                <div className="findingItem" key={finding.path}>
                  <strong>{finding.title}</strong>
                  <span>{finding.path}</span>
                  <em>{Math.round(finding.score * 100)}%</em>
                </div>
              ))
            ) : (
              <p>No lore citations yet.</p>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}

function useTicker(interval: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(id);
  }, [interval]);
  return now;
}

function remaining(resetAt: number | undefined, now: number): number {
  if (!resetAt) return 0;
  return Math.max(0, Math.ceil((resetAt - now) / 1000));
}

async function hydrateTreeFallback(directories: WikiDirectory[]): Promise<WikiDirectory[]> {
  if (directories.length) return directories;
  try {
    const response = await fetch('/lore-index/index.json');
    if (!response.ok) return directories;
    const index = (await response.json()) as {
      entries?: Array<{path: string; title: string; contentHash: string}>;
    };
    const grouped = new Map<string, WikiDirectory>();
    for (const entry of index.entries ?? []) {
      const directoryPath = entry.path.split('/').slice(0, -1).join('/');
      if (!directoryPath || directoryPath === 'docs' || directoryPath === 'docs/canon') continue;
      const filename = entry.path.split('/').pop() ?? '';
      const kind = filename === 'formats.md' || filename === 'rules.md' ? 'rules' : 'document';
      const existing = grouped.get(directoryPath) ?? {
        path: directoryPath,
        name: directoryPath.split('/').pop()?.replace(/[-_]+/g, ' ') ?? directoryPath,
        hasRules: false,
        files: [],
      };
      if (kind === 'rules') {
        existing.hasRules = true;
        existing.rulesPath = entry.path;
      }
      existing.files.push({
        path: entry.path,
        title: entry.title,
        sha: entry.contentHash,
        kind,
        editable: true,
      });
      grouped.set(directoryPath, existing);
    }
    return Array.from(grouped.values()).sort((a, b) => a.path.localeCompare(b.path));
  } catch {
    return directories;
  }
}

function defaultRulesForDirectory(directoryPath: string): DirectoryRulesResponse {
  const name = directoryPath.split('/').pop()?.replace(/[-_]+/g, ' ') ?? 'Lore Directory';
  return {
    directoryPath,
    rulesPath: `${directoryPath}/formats.md`,
    exists: false,
    content: [
      '---',
      `title: ${name} Formats`,
      `slug: ${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-formats`,
      'documentType: Directory Formatting Rules',
      'canonLevel: non-core',
      'authorGithub: system',
      'loreTags:',
      '  - formats',
      'created: "2026-05-06T00:00:00.000Z"',
      'updated: "2026-05-06T00:00:00.000Z"',
      'sourcePr: seed',
      '---',
      '',
      `# ${name} Formats`,
      '',
      'Documents in this directory should read like in-universe archive material.',
      'Use clear section headings, preserve concrete facts, and redact sensitive material with [REDACTED].',
    ].join('\n'),
  };
}

function messageFromError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Request failed.';
}
