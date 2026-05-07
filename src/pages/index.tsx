import React, {useEffect, useMemo, useRef, useState} from 'react';
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import TerminalBrowser from '../components/TerminalBrowser';

type LoreEntry = {
  path: string;
  title: string;
  slug: string;
  canonLevel: 'core' | 'non-core';
  documentType: string;
  loreTags: string[];
  excerpt: string;
};

type MenuAction = {
  key: string;
  label: string;
  description: string;
  run: () => void;
  href?: string;
};

const coreLorePath = '/docs/core-lore/astra-nox-leak-tartarus';
const repositoryUrl = 'https://github.com/suisarbre/protocol-do-not-jump';
const contributingUrl = `${repositoryUrl}/blob/main/CONTRIBUTING.md`;
const bootLines = [
  '> Establishing connection to dead-space node M-41... [OK]',
  '> Decrypting salvaged data fragments... [PARTIAL]',
  '> Access level: GUEST. Proceed with caution.',
  '',
  '> What would you like to do?',
];

export default function TerminalLanding(): JSX.Element {
  const indexUrl = useBaseUrl('/lore-index/index.json');
  const [typedText, setTypedText] = useState('');
  const [bootComplete, setBootComplete] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [initialFilePath, setInitialFilePath] = useState<string | undefined>(undefined);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<LoreEntry[]>([]);
  const [countdown, setCountdown] = useState(formatCountdown());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const bootSkippedRef = useRef(false);
  const fullBootText = useMemo(() => bootLines.join('\n'), []);

  useEffect(() => {
    let cancelled = false;
    let index = 0;
    const startId = window.setTimeout(typeNext, 180);

    function typeNext() {
      if (cancelled || bootSkippedRef.current) return;
      if (index >= fullBootText.length) {
        setBootComplete(true);
        return;
      }
      index += 3;
      setTypedText(fullBootText.slice(0, index));
      window.setTimeout(typeNext, 8 + Math.random() * 10);
    }

    return () => {
      cancelled = true;
      window.clearTimeout(startId);
    };
  }, [fullBootText]);

  useEffect(() => {
    fetch(indexUrl)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('Index unavailable'))))
      .then((payload: {entries?: LoreEntry[]}) => setEntries(payload.entries ?? []))
      .catch(() => setEntries([]));
  }, [indexUrl]);

  useEffect(() => {
    const timer = window.setInterval(() => setCountdown(formatCountdown()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (searchOpen) {
      window.setTimeout(() => searchInputRef.current?.focus(), 80);
    }
  }, [searchOpen]);

  const searchableEntries = useMemo(
    () => entries.filter((entry) => !entry.path.endsWith('/formats.md') && !entry.path.endsWith('/rules.md')),
    [entries],
  );

  const searchResults = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return searchableEntries.slice(0, 5);

    return searchableEntries
      .filter((entry) =>
        [entry.title, entry.excerpt, entry.documentType, entry.loreTags.join(' ')]
          .join(' ')
          .toLowerCase()
          .includes(normalized),
      )
      .slice(0, 8);
  }, [query, searchableEntries]);

  const menuItems: MenuAction[] = [
    {
      key: '1',
      label: '[BROWSE ARCHIVE]',
      description: 'Navigate the recovered document archive.',
      run: () => { setInitialFilePath(undefined); setBrowserOpen(true); },
    },
    {
      key: '2',
      label: '[INITIATE DOCUMENT QUERY]',
      description: 'Search the decrypted archive.',
      run: () => setSearchOpen(true),
    },
    {
      key: '3',
      label: '[VIEW RANDOM DECRYPTED LOG]',
      description: 'Access a random fragment.',
      run: () => {
        if (!searchableEntries.length) return;
        const pick = searchableEntries[Math.floor(Math.random() * searchableEntries.length)]!;
        setInitialFilePath(pick.path);
        setBrowserOpen(true);
      },
    },
    {
      key: '4',
      label: '[UPLOAD NEW DATA FRAGMENT]',
      description: 'Contribute to the reconstruction effort.',
      href: contributingUrl,
      run: () => {
        window.location.href = contributingUrl;
      },
    },
    {
      key: '5',
      label: '[VIEW SYSTEM STATUS]',
      description: 'Monitor node integrity and active protocols.',
      run: () => statusRef.current?.scrollIntoView({behavior: 'smooth', block: 'end'}),
    },
  ];

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSearchOpen(false);
        setQuery('');
        return;
      }

      if (document.activeElement instanceof HTMLInputElement) return;
      const item = menuItems.find((candidate) => candidate.key === event.key);
      if (item) {
        event.preventDefault();
        item.run();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuItems]);

  return (
    <>
      <Head>
        <title>DEAD-SPACE NODE M-41 TERMINAL</title>
        <meta
          name="description"
          content="Recovered archive terminal for Protocol Do Not Jump."
        />
      </Head>
      <main
        className="landing-terminal"
        onClick={() => {
          if (!bootComplete) {
            bootSkippedRef.current = true;
            setTypedText(fullBootText);
            setBootComplete(true);
          }
        }}
      >
        <section className="terminal-alert" aria-label="System warning">
          [WARNING] THIS NODE IS DECOMMISSIONED. UNAUTHORIZED ACCESS IS A CLASS-A GALACTIC FELONY.
        </section>

        <section
          className="terminal-main"
          aria-label="Dead-space node terminal"
        >
          <header className="terminal-header">
            <span>┌─ DEAD-SPACE NODE M-41</span>
            <span>RECOVERY CONSOLE // GUEST ACCESS ─┐</span>
          </header>

          <pre className="boot-sequence" aria-live="polite">
            {renderBootText(typedText)}
            <span className="terminal-cursor">_</span>
          </pre>

          {bootComplete ? (
            browserOpen ? (
              <TerminalBrowser
                initialFilePath={initialFilePath}
                onExit={() => { setBrowserOpen(false); setInitialFilePath(undefined); }}
              />
            ) : (
              <>
                <TerminalMenu items={menuItems} />
                <TerminalSearch
                  open={searchOpen}
                  query={query}
                  setQuery={setQuery}
                  results={searchResults}
                  inputRef={searchInputRef}
                  close={() => { setSearchOpen(false); setQuery(''); }}
                  onOpenFile={(filePath) => {
                    setSearchOpen(false);
                    setQuery('');
                    setInitialFilePath(filePath);
                    setBrowserOpen(true);
                  }}
                />
                <PriorityLeak />
              </>
            )
          ) : null}
        </section>

        <div ref={statusRef} className="terminal-status-anchor" aria-hidden="true" />
      </main>

      <SystemStatusBar fragmentCount={searchableEntries.length} countdown={countdown} />
    </>
  );
}

function TerminalMenu({items}: {items: MenuAction[]}): JSX.Element {
  return (
    <nav className="terminal-menu" aria-label="Terminal command menu">
      <ul>
        {items.map((item) => (
          <li key={item.key}>
            {item.href ? (
              <Link
                to={item.href}
                title={item.description}
                onClick={(event) => {
                  if (item.href?.startsWith('http')) return;
                  event.preventDefault();
                  item.run();
                }}
              >
                <span aria-hidden="true">&gt;</span> [{item.key}] {item.label}
              </Link>
            ) : (
              <button type="button" title={item.description} onClick={item.run}>
                <span aria-hidden="true">&gt;</span> [{item.key}] {item.label}
              </button>
            )}
            <p>{item.description}</p>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function TerminalSearch({
  open,
  query,
  setQuery,
  results,
  inputRef,
  close,
  onOpenFile,
}: {
  open: boolean;
  query: string;
  setQuery: (value: string) => void;
  results: LoreEntry[];
  inputRef: React.RefObject<HTMLInputElement>;
  close: () => void;
  onOpenFile: (filePath: string) => void;
}): JSX.Element | null {
  if (!open) return null;

  return (
    <section className="terminal-search" aria-label="Archive search">
      <label>
        <span>&gt; ENTER SEARCH QUERY:</span>
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search decrypted fragments..."
        />
      </label>
      <p>&gt; RESULTS WILL BE DISPLAYED IN REAL-TIME.</p>
      <div className="terminal-results">
        {results.length ? (
          results.map((entry) => (
            <button
              key={entry.path}
              type="button"
              className="terminal-result-btn"
              onClick={() => onOpenFile(entry.path)}
            >
              <strong>{entry.title}</strong>
              <span>{entry.excerpt || entry.documentType}</span>
            </button>
          ))
        ) : (
          <span className="terminal-null">NO MATCHING FRAGMENTS LOCATED.</span>
        )}
      </div>
      <button type="button" className="terminal-esc" onClick={close}>
        &gt; PRESS [ESC] TO CANCEL QUERY.
      </button>
    </section>
  );
}

function PriorityLeak(): JSX.Element {
  return (
    <Link className="priority-leak" to={coreLorePath}>
      <span>================================================</span>
      <strong>:: TODAY&apos;S PRIORITY LEAK ::</strong>
      <b>Project &apos;Tartarus&apos; - Chief Researcher&apos;s Log</b>
      <em>
        Clearance: <span>OMEGA-RED</span>
      </em>
      <i>Status: [CORRUPTED, RECOVERING...]</i>
      <span>================================================</span>
    </Link>
  );
}

function SystemStatusBar({
  fragmentCount,
  countdown,
}: {
  fragmentCount: number;
  countdown: string;
}): JSX.Element {
  return (
    <footer className="terminal-status-bar">
      <div>
        <span>NODE: M-41</span>
        <span className="status-warn">UPLINK: INTERMITTENT</span>
        <span>FRAGMENTS: {fragmentCount}</span>
      </div>
      <div>
        <Link to={coreLorePath}>PROTOCOL-DO-NOT-JUMP: ACTIVE</Link>
        <span>SILENCE-COUNTDOWN: {countdown}</span>
      </div>
    </footer>
  );
}

function renderBootText(text: string): React.ReactNode[] {
  return text.split(/(\[OK\]|\[PARTIAL\])/g).map((part, index) => {
    if (part === '[OK]') {
      return (
        <span className="boot-ok" key={`${part}-${index}`}>
          {part}
        </span>
      );
    }
    if (part === '[PARTIAL]') {
      return (
        <span className="boot-partial" key={`${part}-${index}`}>
          {part}
        </span>
      );
    }
    return part;
  });
}

function formatCountdown(): string {
  const target = new Date('2026-05-11T00:00:00-07:00').getTime();
  const remaining = target - Date.now();
  if (remaining <= 0) return '[BREACH IMMINENT]';

  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `T-MINUS ${days}D ${pad(hours)}H ${pad(minutes)}M ${pad(seconds)}S`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
