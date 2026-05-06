import React, {useEffect} from 'react';
import Head from '@docusaurus/Head';
import {useHistory} from '@docusaurus/router';
import useBaseUrl from '@docusaurus/useBaseUrl';

type LoreEntry = {
  path: string;
  slug: string;
};

export default function RandomFragment(): JSX.Element {
  const history = useHistory();
  const indexUrl = useBaseUrl('/lore-index/index.json');

  useEffect(() => {
    fetch(indexUrl)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('Index unavailable'))))
      .then((payload: {entries?: LoreEntry[]}) => {
        const entries =
          payload.entries?.filter(
            (entry) => !entry.path.endsWith('/formats.md') && !entry.path.endsWith('/rules.md'),
          ) ?? [];
        const target = entries[Math.floor(Math.random() * entries.length)];
        history.replace(target ? routeForEntry(target) : '/docs/core-lore/astra-nox-leak-tartarus');
      })
      .catch(() => history.replace('/docs/core-lore/astra-nox-leak-tartarus'));
  }, [history, indexUrl]);

  return (
    <>
      <Head>
        <title>Random decrypted log</title>
      </Head>
      <main className="random-terminal">
        <p>&gt; Selecting random decrypted fragment...</p>
      </main>
    </>
  );
}

function routeForEntry(entry: LoreEntry): string {
  if (entry.slug.startsWith('/')) return `/docs${entry.slug}`;
  return `/docs/${entry.slug}`;
}
