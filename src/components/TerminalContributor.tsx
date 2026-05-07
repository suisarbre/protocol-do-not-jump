import React, {useEffect, useRef, useState} from 'react';
import {
  ApiError,
  useApiBaseUrl,
  apiRequest,
  type ProcessResponse,
  type SubmitResponse,
  type WikiTreeResponse,
  type WikiDirectory,
  type SessionResponse,
} from '../lib/apiClient';

type GrammarIssue = {type: string; description: string; suggestion: string};
type GrammarResponse = {rating: 'clean' | 'minor' | 'major'; summary: string; issues: GrammarIssue[]};

type LoreMatch = {path: string; title: string; score: number; excerpt: string};
type LoreConflict = {existingDoc: string; issue: string; severity: 'minor' | 'major'};
type LoreCheckResponse = {
  matches: LoreMatch[];
  conflicts: LoreConflict[];
  docsChecked: number;
  skippedGemini: boolean;
};

type Step =
  | 'auth-check'
  | 'auth'
  | 'select'
  | 'write'
  | 'processing'
  | 'review'
  | 'submitting'
  | 'done';

export default function TerminalContributor({onExit}: {onExit: () => void}): JSX.Element {
  const apiBaseUrl = useApiBaseUrl();
  const [step, setStep] = useState<Step>('auth-check');
  const [user, setUser] = useState<{login: string} | null>(null);

  const [directories, setDirectories] = useState<WikiDirectory[]>([]);
  const [selectedDir, setSelectedDir] = useState<WikiDirectory | null>(null);

  const [draft, setDraft] = useState('');

  const [grammar, setGrammar] = useState<GrammarResponse | null>(null);
  const [grammarLoading, setGrammarLoading] = useState(false);
  const [grammarError, setGrammarError] = useState('');

  const [lore, setLore] = useState<LoreCheckResponse | null>(null);
  const [loreLoading, setLoreLoading] = useState(false);
  const [loreError, setLoreError] = useState('');

  const [processResult, setProcessResult] = useState<ProcessResponse | null>(null);
  const [processError, setProcessError] = useState('');

  const [submitResult, setSubmitResult] = useState<SubmitResponse | null>(null);
  const [submitError, setSubmitError] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    apiRequest<SessionResponse>(apiBaseUrl, '/api/session')
      .then((data) => {
        if (data.authenticated && data.user) {
          setUser(data.user);
          setStep('select');
          loadTree();
        } else {
          setStep('auth');
        }
      })
      .catch(() => setStep('auth'));
  }, [apiBaseUrl]);

  function loadTree() {
    apiRequest<WikiTreeResponse>(apiBaseUrl, '/api/wiki/tree')
      .then((data) => setDirectories(data.directories))
      .catch(() => setDirectories([]));
  }

  async function runGrammarCheck() {
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
  }

  async function runLoreCheck() {
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
  }

  async function runProcess() {
    if (!draft.trim() || !selectedDir) return;
    setStep('processing');
    setProcessError('');
    try {
      const result = await apiRequest<ProcessResponse>(apiBaseUrl, '/api/ai/process', {
        method: 'POST',
        body: JSON.stringify({
          text: draft,
          directoryPath: selectedDir.path,
          operation: 'new',
        }),
      });
      setProcessResult(result);
      setStep('review');
    } catch (err) {
      setProcessError(err instanceof ApiError ? err.message : 'PROCESSING FAILED.');
      setStep('write');
    }
  }

  async function runSubmit() {
    if (!processResult) return;
    setStep('submitting');
    setSubmitError('');
    try {
      const result = await apiRequest<SubmitResponse>(apiBaseUrl, '/api/submissions', {
        method: 'POST',
        body: JSON.stringify({
          formattedMarkdown: processResult.formattedMarkdown,
          title: processResult.title,
          targetPath: processResult.targetPath,
          directoryRulesPath: processResult.directoryRulesPath,
          operation: 'new',
        }),
      });
      setSubmitResult(result);
      setStep('done');
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'SUBMIT FAILED.');
      setStep('review');
    }
  }

  function resetToWrite() {
    setGrammar(null);
    setLore(null);
    setProcessResult(null);
    setProcessError('');
    setSubmitError('');
    setStep('write');
  }

  if (step === 'auth-check') {
    return (
      <div className="terminal-contributor">
        <p className="terminal-loading">VERIFYING SESSION<span className="terminal-cursor">_</span></p>
      </div>
    );
  }

  if (step === 'auth') {
    return (
      <div className="terminal-contributor">
        <div className="terminal-panel-header">:: AUTHENTICATION REQUIRED ::</div>
        <p className="terminal-contributor-hint">
          You must sign in with GitHub to contribute lore fragments.
        </p>
        <a
          href={`${apiBaseUrl}/api/auth/github/start`}
          className="terminal-action-btn terminal-action-btn--primary"
        >
          &gt; [SIGN IN WITH GITHUB]
        </a>
        <button type="button" className="terminal-exit-btn" onClick={onExit}>
          [← RETURN TO MAIN MENU]
        </button>
      </div>
    );
  }

  if (step === 'select') {
    return (
      <div className="terminal-contributor">
        <div className="terminal-panel-header">:: SELECT TARGET DIRECTORY ::</div>
        {user && (
          <p className="terminal-contributor-hint">
            &gt; OPERATOR: {user.login} // SELECT DIRECTORY FOR NEW FRAGMENT
          </p>
        )}
        {directories.length === 0 ? (
          <p className="terminal-loading">LOADING ARCHIVE TREE<span className="terminal-cursor">_</span></p>
        ) : (
          <ul className="terminal-ls-list">
            {directories.map((dir) => (
              <li key={dir.path}>
                <button
                  type="button"
                  className="terminal-ls-item"
                  onClick={() => {
                    setSelectedDir(dir);
                    setStep('write');
                    window.setTimeout(() => textareaRef.current?.focus(), 80);
                  }}
                >
                  <span className="terminal-ls-badge terminal-ls-badge--dir">[DIR] </span>
                  <span className="terminal-ls-name terminal-ls-name--dir">{dir.name}/</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="terminal-exit-btn" onClick={onExit}>
          [← RETURN TO MAIN MENU]
        </button>
      </div>
    );
  }

  if (step === 'write' || step === 'processing') {
    const busy = step === 'processing';
    return (
      <div className="terminal-contributor">
        <div className="terminal-editor-header">
          <span className="terminal-breadcrumb-cmd">write </span>
          <span className="terminal-breadcrumb-path">{selectedDir?.path ?? ''}/</span>
          <button
            type="button"
            className="terminal-back-btn"
            onClick={() => setStep('select')}
            disabled={busy}
          >
            [← CHANGE DIR]
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
            disabled={busy}
          />
        </div>

        {processError && (
          <p className="terminal-fetch-error">[ERROR] {processError}</p>
        )}

        <div className="terminal-action-row">
          <button
            type="button"
            className="terminal-action-btn"
            onClick={runGrammarCheck}
            disabled={busy || grammarLoading || !draft.trim()}
          >
            {grammarLoading ? 'CHECKING...' : '[GRAMMAR CHECK]'}
          </button>
          <button
            type="button"
            className="terminal-action-btn"
            onClick={runLoreCheck}
            disabled={busy || loreLoading || !draft.trim()}
          >
            {loreLoading ? 'CHECKING...' : '[LORE CONFLICT CHECK]'}
          </button>
          <button
            type="button"
            className="terminal-action-btn terminal-action-btn--primary"
            onClick={runProcess}
            disabled={busy || !draft.trim()}
          >
            {busy ? 'PROCESSING...' : '[PROCESS & PUBLISH]'}
          </button>
        </div>

        {grammarError && <p className="terminal-fetch-error">[ERROR] {grammarError}</p>}
        {grammar && <GrammarPanel result={grammar} />}

        {loreError && <p className="terminal-fetch-error">[ERROR] {loreError}</p>}
        {lore && <LorePanel result={lore} />}

        {busy && (
          <p className="terminal-loading">
            AI PROCESSING DRAFT<span className="terminal-cursor">_</span>
          </p>
        )}

        <button type="button" className="terminal-exit-btn" onClick={onExit}>
          [← RETURN TO MAIN MENU]
        </button>
      </div>
    );
  }

  if (step === 'review' && processResult) {
    return (
      <div className="terminal-contributor">
        <div className="terminal-panel-header">══ AI REVIEW ══</div>

        <div className="terminal-review-meta">
          <span>
            RISK:{' '}
            <span className={`terminal-risk-badge terminal-risk-badge--${processResult.riskLevel}`}>
              {processResult.riskLevel.toUpperCase()}
            </span>
          </span>
          <span>TITLE: {processResult.title}</span>
          {processResult.loreFindings.length > 0 && (
            <span>
              LORE HITS:{' '}
              {processResult.loreFindings
                .map((f) => `${f.title} (${f.score.toFixed(2)})`)
                .join(', ')}
            </span>
          )}
          <span>MODERATION: {processResult.moderation.rating.toUpperCase()}</span>
        </div>

        <div className="terminal-panel-header">══ FORMATTED PREVIEW ══</div>
        <pre className="terminal-review-preview">{processResult.formattedMarkdown}</pre>

        {submitError && <p className="terminal-fetch-error">[ERROR] {submitError}</p>}

        <div className="terminal-action-row">
          <button
            type="button"
            className="terminal-action-btn terminal-action-btn--primary"
            onClick={runSubmit}
          >
            [CONFIRM SUBMIT]
          </button>
          <button
            type="button"
            className="terminal-action-btn"
            onClick={resetToWrite}
          >
            [← REVISE DRAFT]
          </button>
        </div>

        <button type="button" className="terminal-exit-btn" onClick={onExit}>
          [← RETURN TO MAIN MENU]
        </button>
      </div>
    );
  }

  if (step === 'submitting') {
    return (
      <div className="terminal-contributor">
        <p className="terminal-loading">
          SUBMITTING FRAGMENT<span className="terminal-cursor">_</span>
        </p>
      </div>
    );
  }

  if (step === 'done' && submitResult) {
    return (
      <div className="terminal-contributor">
        <div className="terminal-panel-header">══ SUBMITTED ══</div>
        <div className="terminal-pr-result">
          <p>
            PR #{submitResult.pullRequestNumber} OPENED:{' '}
            <a href={submitResult.pullRequestUrl} target="_blank" rel="noreferrer">
              {submitResult.pullRequestUrl}
            </a>
          </p>
          <p>
            MERGE STATUS:{' '}
            {submitResult.mergeStatus === 'queued_for_safe_automerge'
              ? 'QUEUED FOR SAFE AUTOMERGE'
              : 'REQUIRES ADMIN REVIEW'}
          </p>
        </div>
        <div className="terminal-action-row">
          <button
            type="button"
            className="terminal-action-btn terminal-action-btn--primary"
            onClick={() => {
              setDraft('');
              setGrammar(null);
              setLore(null);
              setProcessResult(null);
              setSubmitResult(null);
              setStep('select');
            }}
          >
            [← WRITE ANOTHER]
          </button>
          <button type="button" className="terminal-action-btn" onClick={onExit}>
            [← MAIN MENU]
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="terminal-contributor">
      <p className="terminal-loading">LOADING<span className="terminal-cursor">_</span></p>
    </div>
  );
}

function GrammarPanel({result}: {result: GrammarResponse}): JSX.Element {
  const ratingLabel = result.rating === 'clean' ? 'CLEAN' : result.rating === 'minor' ? 'MINOR' : 'MAJOR';
  return (
    <div className="terminal-panel">
      <div className="terminal-panel-header">
        ══ GRAMMAR CHECK — RATING:{' '}
        <span className={`terminal-risk-badge terminal-risk-badge--${result.rating === 'clean' ? 'low' : result.rating === 'minor' ? 'medium' : 'high'}`}>
          {ratingLabel}
        </span>{' '}
        ══
      </div>
      <p className="terminal-panel-summary">&gt; {result.summary}</p>
      {result.issues.map((issue, i) => (
        <div key={i} className="terminal-finding-item">
          <span className="terminal-finding-type">[{issue.type.toUpperCase()}]</span>{' '}
          {issue.description}
          {issue.suggestion && (
            <span className="terminal-finding-suggestion"> → {issue.suggestion}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function LorePanel({result}: {result: LoreCheckResponse}): JSX.Element {
  return (
    <div className="terminal-panel">
      <div className="terminal-panel-header">
        ══ LORE CHECK ({result.docsChecked} docs scanned
        {result.skippedGemini ? ', AI skipped' : ''}) ══
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
