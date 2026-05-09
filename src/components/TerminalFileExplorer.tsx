import React, {useCallback, useEffect, useRef, useState} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ApiError,
  apiRequest,
  useApiBaseUrl,
  type ProcessResponse,
  type SessionResponse,
  type SubmitResponse,
  type WikiDirectory,
  type WikiTreeResponse,
} from '../lib/apiClient';

const REPO_OWNER = 'suisarbre';
const REPO_NAME = 'protocol-do-not-jump';
const BRANCH = 'main';

type GrammarIssue = {type: string; description: string; suggestion: string};
type GrammarResponse = {rating: 'clean' | 'minor' | 'major'; summary: string; issues: GrammarIssue[]};
type LoreMatch = {path: string; title: string; score: number; excerpt: string};
type LoreConflict = {existingDoc: string; issue: string; severity: 'minor' | 'major'};
type LoreCheckResponse = {matches: LoreMatch[]; conflicts: LoreConflict[]; docsChecked: number; skippedGemini: boolean};
type DeleteTarget = {type: 'file'; path: string; sha: string; name: string} | {type: 'folder'; path: string; name: string};
type PrResult = {pullRequestUrl: string; pullRequestNumber: number};

type Step =
  | {mode: 'init'}
  | {mode: 'ls'; cwdPath: string}
  | {mode: 'cat'; filePath: string; content: string}
  | {mode: 'write'; dirPath: string; filePath?: string; sha?: string; initial?: string}
  | {mode: 'new-folder'; parentPath: string}
  | {mode: 'confirm-delete'; target: DeleteTarget}
  | {mode: 'processing'; dirPath: string; filePath?: string; sha?: string}
  | {mode: 'review'; result: ProcessResponse; dirPath: string; sha?: string}
  | {mode: 'submitting'}
  | {mode: 'done'; result: PrResult; label: string};

function childDirs(dirs: WikiDirectory[], cwdPath: string): WikiDirectory[] {
  const prefix = cwdPath === 'docs' ? 'docs/' : `${cwdPath}/`;
  return dirs.filter((d) => {
    if (!d.path.startsWith(prefix)) return false;
    const rel = d.path.slice(prefix.length);
    return rel.length > 0 && !rel.includes('/');
  });
}

function cwdFiles(dirs: WikiDirectory[], cwdPath: string): WikiDirectory['files'] {
  return dirs.find((d) => d.path === cwdPath)?.files ?? [];
}

function stripFrontMatter(src: string): string {
  return src.replace(/^---[\s\S]*?---\n?/, '');
}

export default function TerminalFileExplorer({
  onExit,
  initialFilePath,
}: {
  onExit: () => void;
  initialFilePath?: string;
}): JSX.Element {
  const apiBaseUrl = useApiBaseUrl();
  const [step, setStep] = useState<Step>({mode: 'init'});
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [dirs, setDirs] = useState<WikiDirectory[]>([]);
  const [draft, setDraft] = useState('');
  const [grammar, setGrammar] = useState<GrammarResponse | null>(null);
  const [grammarLoading, setGrammarLoading] = useState(false);
  const [grammarError, setGrammarError] = useState('');
  const [lore, setLore] = useState<LoreCheckResponse | null>(null);
  const [loreLoading, setLoreLoading] = useState(false);
  const [loreError, setLoreError] = useState('');
  const [actionError, setActionError] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [busy, setBusy] = useState(false);
  const fileCache = useRef(new Map<string, string>());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initialFilePathRef = useRef(initialFilePath);

  useEffect(() => {
    const initPath = initialFilePathRef.current;
    Promise.all([
      apiRequest<SessionResponse>(apiBaseUrl, '/api/session').catch(() => null),
      apiRequest<WikiTreeResponse>(apiBaseUrl, '/api/wiki/tree').catch(() => ({directories: []})),
    ]).then(([sess, tree]) => {
      setSession(sess);
      setDirs(tree.directories);
      if (initPath) {
        loadForView(initPath);
      } else {
        setStep({mode: 'ls', cwdPath: 'docs'});
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBaseUrl]);

  const loadForEdit = useCallback(async (filePath: string) => {
    setActionError('');
    setBusy(true);
    try {
      const file = await apiRequest<{path: string; sha: string; content: string}>(
        apiBaseUrl,
        `/api/wiki/file?path=${encodeURIComponent(filePath)}`,
      );
      setDraft(stripFrontMatter(file.content));
      setGrammar(null);
      setLore(null);
      const dirPath = filePath.split('/').slice(0, -1).join('/');
      setStep({mode: 'write', dirPath, filePath: file.path, sha: file.sha, initial: file.content});
      window.setTimeout(() => textareaRef.current?.focus(), 80);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'FAILED TO LOAD FILE.');
    } finally {
      setBusy(false);
    }
  }, [apiBaseUrl]);

  const loadForView = useCallback(async (filePath: string) => {
    setActionError('');
    if (fileCache.current.has(filePath)) {
      setStep({mode: 'cat', filePath, content: fileCache.current.get(filePath)!});
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/${filePath}`,
      );
      if (!res.ok) throw new Error('not found');
      const text = await res.text();
      fileCache.current.set(filePath, text);
      setStep({mode: 'cat', filePath, content: text});
    } catch {
      setActionError(`CANNOT ACCESS FILE: ${filePath}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const runGrammarCheck = useCallback(async () => {
    if (!draft.trim()) return;
    setGrammarLoading(true);
    setGrammarError('');
    try {
      const result = await apiRequest<GrammarResponse>(apiBaseUrl, '/api/ai/grammar', {
        method: 'POST',
        body: JSON.stringify({text: draft}),
      });
      setGrammar(result);
    } catch (err) {
      setGrammarError(err instanceof ApiError ? err.message : 'GRAMMAR CHECK FAILED.');
    } finally {
      setGrammarLoading(false);
    }
  }, [apiBaseUrl, draft]);

  const runLoreCheck = useCallback(async () => {
    if (!draft.trim()) return;
    setLoreLoading(true);
    setLoreError('');
    try {
      const result = await apiRequest<LoreCheckResponse>(apiBaseUrl, '/api/ai/lore-check', {
        method: 'POST',
        body: JSON.stringify({text: draft, limit: 5}),
      });
      setLore(result);
    } catch (err) {
      setLoreError(err instanceof ApiError ? err.message : 'LORE CHECK FAILED.');
    } finally {
      setLoreLoading(false);
    }
  }, [apiBaseUrl, draft]);

  const runProcess = useCallback(async (dirPath: string, filePath?: string, sha?: string, skipAi?: boolean) => {
    if (!draft.trim()) return;
    setActionError('');
    setStep({mode: 'processing', dirPath, filePath, sha});
    try {
      const result = await apiRequest<ProcessResponse>(apiBaseUrl, '/api/ai/process', {
        method: 'POST',
        body: JSON.stringify({
          text: draft,
          directoryPath: dirPath,
          operation: filePath ? 'edit' : 'new',
          targetPath: filePath,
          baseBlobSha: sha,
          skipAi,
        }),
      });
      setStep({mode: 'review', result, dirPath, sha});
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'PROCESSING FAILED.');
      setStep({mode: 'write', dirPath, filePath, sha});
    }
  }, [apiBaseUrl, draft]);

  const runSubmit = useCallback(async (result: ProcessResponse, sha?: string) => {
    setActionError('');
    setStep({mode: 'submitting'});
    try {
      const submitResult = await apiRequest<SubmitResponse>(apiBaseUrl, '/api/submissions', {
        method: 'POST',
        body: JSON.stringify({
          markdown: result.formattedMarkdown,
          targetPath: result.targetPath,
          operation: sha ? 'edit' : 'new',
          baseBlobSha: sha,
        }),
      });
      setStep({mode: 'done', result: submitResult, label: 'SUBMITTED'});
      setDraft('');
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'SUBMIT FAILED.');
      setStep({mode: 'review', result, dirPath: result.targetPath.split('/').slice(0, -1).join('/'), sha});
    }
  }, [apiBaseUrl]);

  const runCreateFolder = useCallback(async (parentPath: string, name: string) => {
    const folderPath = `${parentPath}/${name.trim().replace(/\s+/g, '-').toLowerCase()}`;
    setActionError('');
    setBusy(true);
    try {
      const result = await apiRequest<PrResult>(apiBaseUrl, '/api/wiki/create-folder', {
        method: 'POST',
        body: JSON.stringify({path: folderPath}),
      });
      setNewFolderName('');
      setStep({mode: 'done', result, label: 'FOLDER CREATION PR OPENED'});
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'FOLDER CREATION FAILED.');
      setStep({mode: 'ls', cwdPath: parentPath});
    } finally {
      setBusy(false);
    }
  }, [apiBaseUrl]);

  const runDeleteFile = useCallback(async (filePath: string, sha: string) => {
    setActionError('');
    setBusy(true);
    try {
      const result = await apiRequest<PrResult>(apiBaseUrl, '/api/wiki/delete-file', {
        method: 'POST',
        body: JSON.stringify({path: filePath, sha}),
      });
      setStep({mode: 'done', result, label: 'DELETION PR OPENED'});
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'DELETE FAILED.');
      const cwdPath = filePath.split('/').slice(0, -1).join('/');
      setStep({mode: 'ls', cwdPath});
    } finally {
      setBusy(false);
    }
  }, [apiBaseUrl]);

  const runDeleteFolder = useCallback(async (folderPath: string) => {
    setActionError('');
    setBusy(true);
    try {
      const result = await apiRequest<PrResult>(apiBaseUrl, '/api/wiki/delete-folder', {
        method: 'POST',
        body: JSON.stringify({path: folderPath}),
      });
      setStep({mode: 'done', result, label: 'FOLDER DELETION PR OPENED'});
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'DELETE FAILED.');
      const parentPath = folderPath.split('/').slice(0, -1).join('/') || 'docs';
      setStep({mode: 'ls', cwdPath: parentPath});
    } finally {
      setBusy(false);
    }
  }, [apiBaseUrl]);

  const isAuth = Boolean(session?.authenticated);
  const admin = Boolean(session?.isAdmin);

  // ── init ──────────────────────────────────────────────────────────────────
  if (step.mode === 'init') {
    return (
      <div className="terminal-explorer">
        <p className="terminal-loading">ACCESSING ARCHIVE<span className="terminal-cursor">_</span></p>
      </div>
    );
  }

  // ── ls ────────────────────────────────────────────────────────────────────
  if (step.mode === 'ls') {
    const {cwdPath} = step;
    const segments = cwdPath.split('/');
    const subDirs = childDirs(dirs, cwdPath);
    const files = cwdFiles(dirs, cwdPath);
    const parentPath = segments.length > 1 ? segments.slice(0, -1).join('/') : null;

    return (
      <div className="terminal-explorer">
        <div className="terminal-breadcrumb">
          <span className="terminal-prompt-sym">&gt;</span>{' '}
          <span className="terminal-breadcrumb-cmd">ls </span>
          {segments.map((seg, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="terminal-breadcrumb-sep">/</span>}
              <button
                type="button"
                className="terminal-breadcrumb-seg"
                onClick={() => setStep({mode: 'ls', cwdPath: segments.slice(0, i + 1).join('/')})}
              >
                {seg}
              </button>
            </React.Fragment>
          ))}
          <span className="terminal-breadcrumb-sep">/</span>
          {admin && <span className="terminal-admin-badge">[ADMIN]</span>}
        </div>

        {actionError && <p className="terminal-fetch-error">[ERROR] {actionError}</p>}

        {busy && <p className="terminal-loading">WORKING<span className="terminal-cursor">_</span></p>}

        <ul className="terminal-ls-list">
          {parentPath && (
            <li>
              <button
                type="button"
                className="terminal-ls-item"
                onClick={() => { setActionError(''); setStep({mode: 'ls', cwdPath: parentPath}); }}
              >
                <span className="terminal-ls-badge terminal-ls-badge--dir">[DIR] </span>
                <span className="terminal-ls-name terminal-ls-name--dir">../</span>
              </button>
            </li>
          )}

          {subDirs.map((dir) => {
            const isEmpty = dir.files.filter((f) => f.kind === 'document').length === 0;
            return (
              <li key={dir.path}>
                <div className="terminal-ls-row">
                  <button
                    type="button"
                    className="terminal-ls-item"
                    onClick={() => { setActionError(''); setStep({mode: 'ls', cwdPath: dir.path}); }}
                  >
                    <span className="terminal-ls-badge terminal-ls-badge--dir">[DIR] </span>
                    <span className="terminal-ls-name terminal-ls-name--dir">{dir.name}/</span>
                  </button>
                  <div className="terminal-file-ops">
                    {admin && (
                      <button
                        type="button"
                        className="terminal-file-ops-btn terminal-file-ops-btn--danger"
                        title={isEmpty ? 'Delete folder' : 'Folder must be empty to delete'}
                        disabled={!isEmpty || busy}
                        onClick={() => { setActionError(''); setStep({mode: 'confirm-delete', target: {type: 'folder', path: dir.path, name: dir.name}}); }}
                      >
                        [DEL]
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}

          {files.map((file) => (
            <li key={file.path}>
              <div className="terminal-ls-row">
                <span className="terminal-ls-name">
                  <span className="terminal-ls-badge terminal-ls-badge--file">[FILE]</span>{' '}
                  {file.title || file.path.split('/').pop()}
                </span>
                <div className="terminal-file-ops">
                  <button
                    type="button"
                    className="terminal-file-ops-btn"
                    disabled={busy}
                    onClick={() => loadForView(file.path)}
                  >
                    [VIEW]
                  </button>
                  {(isAuth && file.editable || admin) && (
                    <button
                      type="button"
                      className="terminal-file-ops-btn"
                      disabled={busy}
                      onClick={() => loadForEdit(file.path)}
                    >
                      [EDIT]
                    </button>
                  )}
                  {admin && (
                    <button
                      type="button"
                      className="terminal-file-ops-btn terminal-file-ops-btn--danger"
                      disabled={busy}
                      onClick={() => {
                        setActionError('');
                        setStep({mode: 'confirm-delete', target: {type: 'file', path: file.path, sha: file.sha ?? '', name: file.title || (file.path.split('/').pop() ?? file.path)}});
                      }}
                    >
                      [DEL]
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}

          {subDirs.length === 0 && files.length === 0 && (
            <li className="terminal-ls-empty">NO FILES IN THIS DIRECTORY.</li>
          )}
        </ul>

        <div className="terminal-explorer-toolbar">
          <div className="terminal-explorer-toolbar-left">
            {isAuth && (
              <>
                <button
                  type="button"
                  className="terminal-action-btn"
                  disabled={busy}
                  onClick={() => { setDraft(''); setGrammar(null); setLore(null); setActionError(''); setStep({mode: 'write', dirPath: cwdPath}); window.setTimeout(() => textareaRef.current?.focus(), 80); }}
                >
                  [+ NEW FILE]
                </button>
                <button
                  type="button"
                  className="terminal-action-btn"
                  disabled={busy}
                  onClick={() => { setNewFolderName(''); setActionError(''); setStep({mode: 'new-folder', parentPath: cwdPath}); }}
                >
                  [+ NEW FOLDER]
                </button>
              </>
            )}
            {!isAuth && (
              <a
                href={`${apiBaseUrl}/api/auth/github/start`}
                className="terminal-action-btn"
              >
                [SIGN IN TO CONTRIBUTE]
              </a>
            )}
          </div>
          <button type="button" className="terminal-exit-btn" onClick={onExit}>
            [← RETURN TO MAIN MENU]
          </button>
        </div>
      </div>
    );
  }

  // ── cat ───────────────────────────────────────────────────────────────────
  if (step.mode === 'cat') {
    const {filePath, content} = step;
    const cwdPath = filePath.split('/').slice(0, -1).join('/');
    return (
      <div className="terminal-explorer">
        <div className="terminal-breadcrumb">
          <span className="terminal-prompt-sym">&gt;</span>{' '}
          <span className="terminal-breadcrumb-cmd">cat </span>
          <span className="terminal-breadcrumb-path">{filePath}</span>
          <button
            type="button"
            className="terminal-back-btn"
            onClick={() => setStep({mode: 'ls', cwdPath})}
          >
            [← BACK]
          </button>
        </div>
        <div className="terminal-cat-view">
          <div className="terminal-file-rule">FILE: {filePath.split('/').pop()}</div>
          <div className="terminal-file-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripFrontMatter(content)}</ReactMarkdown>
          </div>
          <div className="terminal-file-eof">EOF</div>
        </div>
        <div className="terminal-explorer-toolbar">
          <div className="terminal-explorer-toolbar-left">
            {isAuth && (
              <button
                type="button"
                className="terminal-action-btn"
                onClick={() => loadForEdit(filePath)}
              >
                [EDIT THIS FILE]
              </button>
            )}
          </div>
          <button type="button" className="terminal-exit-btn" onClick={() => setStep({mode: 'ls', cwdPath})}>
            [← BACK TO LIST]
          </button>
        </div>
      </div>
    );
  }

  // ── write / edit ──────────────────────────────────────────────────────────
  if (step.mode === 'write') {
    const {dirPath, filePath, sha} = step;
    const isEdit = Boolean(filePath);
    return (
      <div className="terminal-explorer">
        <div className="terminal-editor-header">
          <span className="terminal-breadcrumb-cmd">{isEdit ? 'edit' : 'write'} </span>
          <span className="terminal-breadcrumb-path">{filePath ?? dirPath + '/'}</span>
          <button
            type="button"
            className="terminal-back-btn"
            onClick={() => setStep({mode: 'ls', cwdPath: dirPath})}
          >
            [← BACK]
          </button>
        </div>

        <div className="terminal-panel-header">══ DRAFT EDITOR ══</div>
        <div className="terminal-editor">
          <textarea
            ref={textareaRef}
            className="terminal-editor-textarea"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="> Enter your lore fragment here..."
            rows={12}
          />
        </div>

        {actionError && <p className="terminal-fetch-error">[ERROR] {actionError}</p>}

        <div className="terminal-action-row">
          <button
            type="button"
            className="terminal-action-btn"
            onClick={runGrammarCheck}
            disabled={grammarLoading || !draft.trim()}
          >
            {grammarLoading ? 'CHECKING...' : '[GRAMMAR CHECK]'}
          </button>
          <button
            type="button"
            className="terminal-action-btn"
            onClick={runLoreCheck}
            disabled={loreLoading || !draft.trim()}
          >
            {loreLoading ? 'CHECKING...' : '[LORE CHECK]'}
          </button>
          <button
            type="button"
            className="terminal-action-btn terminal-action-btn--primary"
            onClick={() => runProcess(dirPath, filePath, sha)}
            disabled={!draft.trim()}
          >
            [PROCESS & PUBLISH]
          </button>
          {admin && (
            <button
              type="button"
              className="terminal-action-btn terminal-action-btn--primary"
              title="Skip AI revision and submit your draft as-is"
              onClick={() => runProcess(dirPath, filePath, sha, true)}
              disabled={!draft.trim()}
            >
              [PUBLISH RAW (ADMIN)]
            </button>
          )}
        </div>

        {grammarError && <p className="terminal-fetch-error">[ERROR] {grammarError}</p>}
        {grammar && <GrammarPanel result={grammar} />}
        {loreError && <p className="terminal-fetch-error">[ERROR] {loreError}</p>}
        {lore && <LorePanel result={lore} />}

        <button type="button" className="terminal-exit-btn" onClick={onExit}>
          [← RETURN TO MAIN MENU]
        </button>
      </div>
    );
  }

  // ── new-folder ────────────────────────────────────────────────────────────
  if (step.mode === 'new-folder') {
    const {parentPath} = step;
    return (
      <div className="terminal-explorer">
        <div className="terminal-editor-header">
          <span className="terminal-breadcrumb-cmd">mkdir </span>
          <span className="terminal-breadcrumb-path">{parentPath}/</span>
          <button type="button" className="terminal-back-btn" onClick={() => setStep({mode: 'ls', cwdPath: parentPath})}>[← BACK]</button>
        </div>
        <div className="terminal-panel-header">══ NEW FOLDER ══</div>
        {actionError && <p className="terminal-fetch-error">[ERROR] {actionError}</p>}
        <label className="terminal-folder-label">
          <span>&gt; FOLDER NAME:</span>
          <input
            className="terminal-folder-input"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="e.g. field-reports"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter' && newFolderName.trim()) runCreateFolder(parentPath, newFolderName); }}
          />
        </label>
        <div className="terminal-action-row">
          <button
            type="button"
            className="terminal-action-btn terminal-action-btn--primary"
            disabled={!newFolderName.trim() || busy}
            onClick={() => runCreateFolder(parentPath, newFolderName)}
          >
            {busy ? 'CREATING...' : '[CREATE FOLDER]'}
          </button>
          <button type="button" className="terminal-action-btn" onClick={() => setStep({mode: 'ls', cwdPath: parentPath})}>[← CANCEL]</button>
        </div>
      </div>
    );
  }

  // ── confirm-delete ────────────────────────────────────────────────────────
  if (step.mode === 'confirm-delete') {
    const {target} = step;
    const backPath = target.type === 'file'
      ? target.path.split('/').slice(0, -1).join('/')
      : target.path.split('/').slice(0, -1).join('/') || 'docs';
    return (
      <div className="terminal-explorer">
        <div className="terminal-delete-panel">
          <div className="terminal-panel-header">══ CONFIRM DELETION ══</div>
          <p className="terminal-delete-warning">
            WARNING: This will open a PR to permanently delete:
          </p>
          <p className="terminal-delete-target">
            {target.type === 'folder' ? '[DIR] ' : '[FILE] '}{target.path}
          </p>
          <p className="terminal-delete-note">
            The deletion only takes effect when the PR is merged.
          </p>
        </div>
        {actionError && <p className="terminal-fetch-error">[ERROR] {actionError}</p>}
        <div className="terminal-action-row">
          <button
            type="button"
            className="terminal-action-btn terminal-file-ops-btn--danger"
            disabled={busy}
            onClick={() => {
              if (target.type === 'file') runDeleteFile(target.path, target.sha);
              else runDeleteFolder(target.path);
            }}
          >
            {busy ? 'WORKING...' : '[OPEN DELETE PR]'}
          </button>
          <button
            type="button"
            className="terminal-action-btn"
            onClick={() => { setActionError(''); setStep({mode: 'ls', cwdPath: backPath}); }}
          >
            [← CANCEL]
          </button>
        </div>
      </div>
    );
  }

  // ── processing ────────────────────────────────────────────────────────────
  if (step.mode === 'processing') {
    return (
      <div className="terminal-explorer">
        <p className="terminal-loading">AI PROCESSING DRAFT<span className="terminal-cursor">_</span></p>
      </div>
    );
  }

  // ── review ────────────────────────────────────────────────────────────────
  if (step.mode === 'review') {
    const {result, dirPath, sha} = step;
    const filePath = sha ? result.targetPath : undefined;
    return (
      <div className="terminal-explorer">
        <div className="terminal-panel-header">══ AI REVIEW ══</div>
        <div className="terminal-review-meta">
          <span>RISK: <span className={`terminal-risk-badge terminal-risk-badge--${result.riskLevel}`}>{result.riskLevel.toUpperCase()}</span></span>
          <span>TITLE: {result.title}</span>
          {result.loreFindings.length > 0 && (
            <span>LORE HITS: {result.loreFindings.map((f) => `${f.title} (${f.score.toFixed(2)})`).join(', ')}</span>
          )}
          <span>MODERATION: {result.moderation.rating.toUpperCase()}</span>
        </div>
        <div className="terminal-panel-header">══ FORMATTED PREVIEW ══</div>
        <pre className="terminal-review-preview">{result.formattedMarkdown}</pre>
        {actionError && <p className="terminal-fetch-error">[ERROR] {actionError}</p>}
        <div className="terminal-action-row">
          <button type="button" className="terminal-action-btn terminal-action-btn--primary" onClick={() => runSubmit(result, sha)}>
            [CONFIRM SUBMIT]
          </button>
          <button type="button" className="terminal-action-btn" onClick={() => setStep({mode: 'write', dirPath, filePath, sha})}>
            [← REVISE DRAFT]
          </button>
        </div>
        <button type="button" className="terminal-exit-btn" onClick={onExit}>[← RETURN TO MAIN MENU]</button>
      </div>
    );
  }

  // ── submitting ────────────────────────────────────────────────────────────
  if (step.mode === 'submitting') {
    return (
      <div className="terminal-explorer">
        <p className="terminal-loading">SUBMITTING<span className="terminal-cursor">_</span></p>
      </div>
    );
  }

  // ── done ──────────────────────────────────────────────────────────────────
  if (step.mode === 'done') {
    const {result, label} = step;
    return (
      <div className="terminal-explorer">
        <div className="terminal-panel-header">══ {label} ══</div>
        <div className="terminal-pr-result">
          <p>
            PR #{result.pullRequestNumber} OPENED:{' '}
            <a href={result.pullRequestUrl} target="_blank" rel="noreferrer">
              {result.pullRequestUrl}
            </a>
          </p>
        </div>
        <div className="terminal-action-row">
          <button
            type="button"
            className="terminal-action-btn terminal-action-btn--primary"
            onClick={() => { setStep({mode: 'ls', cwdPath: 'docs'}); setActionError(''); }}
          >
            [← BROWSE ARCHIVE]
          </button>
          <button type="button" className="terminal-action-btn" onClick={onExit}>[← MAIN MENU]</button>
        </div>
      </div>
    );
  }

  return null;
}

function GrammarPanel({result}: {result: GrammarResponse}): JSX.Element {
  const ratingLabel = result.rating === 'clean' ? 'CLEAN' : result.rating === 'minor' ? 'MINOR' : 'MAJOR';
  const ratingClass = result.rating === 'clean' ? 'low' : result.rating === 'minor' ? 'medium' : 'high';
  return (
    <div className="terminal-panel">
      <div className="terminal-panel-header">
        ══ GRAMMAR CHECK — RATING: <span className={`terminal-risk-badge terminal-risk-badge--${ratingClass}`}>{ratingLabel}</span> ══
      </div>
      <p className="terminal-panel-summary">&gt; {result.summary}</p>
      {result.issues.map((issue, i) => (
        <div key={i} className="terminal-finding-item">
          <span className="terminal-finding-type">[{issue.type.toUpperCase()}]</span>{' '}
          {issue.description}
          {issue.suggestion && <span className="terminal-finding-suggestion"> → {issue.suggestion}</span>}
        </div>
      ))}
    </div>
  );
}

function LorePanel({result}: {result: LoreCheckResponse}): JSX.Element {
  return (
    <div className="terminal-panel">
      <div className="terminal-panel-header">
        ══ LORE CHECK ({result.docsChecked} docs scanned{result.skippedGemini ? ', AI skipped' : ''}) ══
      </div>
      {result.conflicts.length === 0 && result.matches.length === 0 && (
        <p className="terminal-panel-summary">&gt; NO CONFLICTS OR SIMILAR ENTRIES DETECTED.</p>
      )}
      {result.conflicts.map((conflict, i) => (
        <div key={i} className="terminal-finding-item">
          <span className={`terminal-risk-badge terminal-risk-badge--${conflict.severity === 'major' ? 'high' : 'medium'}`}>
            CONFLICT [{conflict.severity.toUpperCase()}]
          </span>{' '}
          <strong>{conflict.existingDoc}:</strong> {conflict.issue}
        </div>
      ))}
      {result.matches
        .filter((m) => !result.conflicts.find((c) => c.existingDoc === m.title))
        .map((match, i) => (
          <div key={i} className="terminal-finding-item terminal-finding-item--similar">
            <span className="terminal-finding-type">SIMILAR</span>{' '}
            {match.title}{' '}
            <span className="terminal-finding-score">(score {match.score.toFixed(2)})</span>
            {' '}— no conflicts
          </div>
        ))}
    </div>
  );
}
