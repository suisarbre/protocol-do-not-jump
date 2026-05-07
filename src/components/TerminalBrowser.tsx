import React, {useCallback, useEffect, useRef, useState} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const REPO_OWNER = 'suisarbre';
const REPO_NAME = 'protocol-do-not-jump';
const BRANCH = 'main';
const DOCS_ROOT = 'docs';

type GitHubTreeEntry = {path: string; type: 'blob' | 'tree'};
type ChildEntry = {name: string; kind: 'dir' | 'file'};
type View =
  | {mode: 'loading'}
  | {mode: 'ls'}
  | {mode: 'cat'; filePath: string}
  | {mode: 'error'; message: string};

function listChildren(blobs: string[], cwd: string): ChildEntry[] {
  const prefix = `${cwd}/`;
  const dirSet = new Set<string>();
  const fileList: string[] = [];

  for (const blobPath of blobs) {
    if (!blobPath.startsWith(prefix)) continue;
    const rel = blobPath.slice(prefix.length);
    if (!rel) continue;
    const slash = rel.indexOf('/');
    if (slash === -1) {
      if (rel !== 'formats.md' && rel !== 'rules.md') fileList.push(rel);
    } else {
      dirSet.add(rel.slice(0, slash));
    }
  }

  const result: ChildEntry[] = [];
  dirSet.forEach((name) => result.push({name, kind: 'dir'}));
  fileList.forEach((name) => result.push({name, kind: 'file'}));
  return result.sort((a, b) =>
    a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1,
  );
}

function stripFrontMatter(src: string): string {
  return src.replace(/^---[\s\S]*?---\n?/, '');
}

export default function TerminalBrowser({onExit}: {onExit?: () => void}): JSX.Element {
  const [blobs, setBlobs] = useState<string[]>([]);
  const [cwd, setCwd] = useState([DOCS_ROOT]);
  const [view, setView] = useState<View>({mode: 'loading'});
  const fileCache = useRef(new Map<string, string>());
  const containerRef = useRef<HTMLDivElement>(null);

  const cwdPath = cwd.join('/');

  const catFile = useCallback(async (filePath: string) => {
    if (fileCache.current.has(filePath)) {
      setView({mode: 'cat', filePath});
      return;
    }
    setView({mode: 'loading'});
    try {
      const res = await fetch(
        `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/${filePath}`,
      );
      if (!res.ok) throw new Error('not found');
      const text = await res.text();
      fileCache.current.set(filePath, text);
      setView({mode: 'cat', filePath});
    } catch {
      setView({mode: 'error', message: `CANNOT ACCESS FILE: ${filePath}`});
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/trees/${BRANCH}?recursive=1`,
      {headers: {Accept: 'application/vnd.github+json'}, signal: controller.signal},
    )
      .then((r) => r.json())
      .then((data: {tree?: GitHubTreeEntry[]}) => {
        const docBlobs = (data.tree ?? [])
          .filter((e) => e.type === 'blob' && e.path.startsWith(`${DOCS_ROOT}/`))
          .map((e) => e.path);
        setBlobs(docBlobs);
        const hash = window.location.hash.replace(/^#/, '');
        if (hash.startsWith(`${DOCS_ROOT}/`)) {
          catFile(hash);
        } else {
          setView({mode: 'ls'});
        }
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') {
          setView({mode: 'error', message: 'FAILED TO ACCESS ARCHIVE INDEX. CHECK UPLINK.'});
        }
      });
    return () => controller.abort();
  }, [catFile]);

  useEffect(() => {
    containerRef.current?.scrollTo({top: 0});
  }, [view.mode]);

  const children = view.mode === 'ls' ? listChildren(blobs, cwdPath) : [];

  return (
    <div className="terminal-browser" ref={containerRef}>
      <div className="terminal-breadcrumb">
        <span className="terminal-prompt-sym">&gt;</span>{' '}
        {view.mode === 'cat' ? (
          <>
            <span className="terminal-breadcrumb-cmd">cat </span>
            <span className="terminal-breadcrumb-path">
              {(view as {mode: 'cat'; filePath: string}).filePath}
            </span>
          </>
        ) : (
          <>
            <span className="terminal-breadcrumb-cmd">ls </span>
            {cwd.map((seg, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="terminal-breadcrumb-sep">/</span>}
                <button
                  type="button"
                  className="terminal-breadcrumb-seg"
                  onClick={() => {
                    setCwd((p) => p.slice(0, i + 1));
                    setView({mode: 'ls'});
                  }}
                >
                  {seg}
                </button>
              </React.Fragment>
            ))}
            <span className="terminal-breadcrumb-sep">/</span>
          </>
        )}
        {view.mode === 'cat' && (
          <button type="button" className="terminal-back-btn" onClick={() => setView({mode: 'ls'})}>
            [← BACK]
          </button>
        )}
      </div>

      {view.mode === 'loading' && (
        <p className="terminal-loading">
          ACCESSING<span className="terminal-cursor">_</span>
        </p>
      )}

      {view.mode === 'error' && (
        <p className="terminal-fetch-error">
          [ERROR] {(view as {mode: 'error'; message: string}).message}
        </p>
      )}

      {view.mode === 'ls' && (
        <ul className="terminal-ls-list">
          {children.length === 0 && blobs.length > 0 ? (
            <li className="terminal-ls-empty">NO FILES IN THIS DIRECTORY.</li>
          ) : (
            children.map((entry) => (
              <li key={entry.name}>
                <button
                  type="button"
                  className="terminal-ls-item"
                  onClick={() => {
                    if (entry.kind === 'dir') {
                      setCwd((p) => [...p, entry.name]);
                      setView({mode: 'ls'});
                    } else {
                      catFile(`${cwdPath}/${entry.name}`);
                    }
                  }}
                >
                  <span className={`terminal-ls-badge terminal-ls-badge--${entry.kind}`}>
                    {entry.kind === 'dir' ? '[DIR] ' : '[FILE]'}
                  </span>
                  <span className={`terminal-ls-name terminal-ls-name--${entry.kind}`}>
                    {entry.name}
                    {entry.kind === 'dir' ? '/' : ''}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}

      {view.mode === 'cat' &&
        (() => {
          const catView = view as {mode: 'cat'; filePath: string};
          const content = fileCache.current.get(catView.filePath);
          if (!content) return null;
          return (
            <div className="terminal-cat-view">
              <div className="terminal-file-rule">
                FILE: {catView.filePath.split('/').pop()}
              </div>
              <div className="terminal-file-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {stripFrontMatter(content)}
                </ReactMarkdown>
              </div>
              <div className="terminal-file-eof">EOF</div>
            </div>
          );
        })()}

      <div className="terminal-browser-hints">
        <span>[CLICK] SELECT</span>
        {view.mode === 'cat' && <span>[BACK] RETURN TO LIST</span>}
        {view.mode === 'ls' && cwd.length > 1 && <span>[..] PARENT DIR</span>}
      </div>

      {onExit && (
        <div className="terminal-browser-footer">
          <button type="button" className="terminal-exit-btn" onClick={onExit}>
            [← RETURN TO MAIN MENU]
          </button>
          <span style={{color: 'rgba(255,140,0,0.25)', fontSize: '10px', letterSpacing: '1px'}}>
            NODE M-41 // READ-ONLY
          </span>
        </div>
      )}
    </div>
  );
}
