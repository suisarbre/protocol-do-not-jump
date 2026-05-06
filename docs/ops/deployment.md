---
title: Deployment Guide
slug: deployment-guide
documentType: Operations Guide
canonLevel: non-core
authorGithub: system
loreTags:
  - deployment
  - operations
created: "2026-05-06T00:00:00.000Z"
updated: "2026-05-06T00:00:00.000Z"
sourcePr: seed
---

# Deployment Guide

## GitHub

Create a personal public repository for the MVP. Configure GitHub Pages to use
the `Deploy Pages` workflow.

Create a GitHub OAuth app for contributor sign-in. Its callback URL should point
to the deployed Vercel API route:

```text
https://YOUR_VERCEL_PROJECT.vercel.app/api/auth/github/callback
```

Create a GitHub App for repository automation with these permissions:

- Metadata: read
- Contents: read and write
- Pull requests: read and write
- Issues: read and write, for labels

Install that GitHub App on the lore wiki repository.

## Vercel

Deploy this same repository to Vercel for the API routes under `/api`.

Set `ALLOWED_ORIGINS` to the GitHub Pages origin and set
`COOKIE_SAME_SITE=None` so browser credential requests work across the GitHub
Pages and Vercel origins. Keep cookies secure in production.

Configure one Vercel WAF rate-limit rule for expensive API routes:

```text
If path starts with /api/ai/ or path equals /api/submissions
Then rate limit by IP
Window: 10 minutes
Threshold: 30 requests
Action: block or challenge
```

The WAF rule is only the perimeter guard. Strict action cooldowns are still
enforced inside the serverless functions with Upstash Redis using GitHub user ID
and a secondary IP hash.

## Vercel Deploy Filtering

In the Vercel project, set:

```text
Settings -> Git -> Ignored Build Step
```

to:

```bash
node scripts/vercel-ignore-build.mjs
```

The script skips Vercel redeploys when a commit only changes lore content under
`docs/` or the generated lore index under `static/lore-index/`. Vercel still
deploys changes to the app, API, server code, CI/scripts, package files, and
project configuration.
