import React from 'react';
import Layout from '@theme/Layout';
import ContributorApp from '../components/ContributorApp';

export default function Contribute(): JSX.Element {
  return (
    <Layout title="Contribute" description="AI-assisted collaborative lore wiki contribution desk">
      <ContributorApp />
    </Layout>
  );
}
