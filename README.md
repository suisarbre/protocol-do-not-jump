# AI-Assisted Collaborative Lore Wiki

A Docusaurus-based collaborative fiction wiki with GitHub-backed submissions,
Gemini-assisted document formatting, lore checking, moderation gates, and
server-side cooldowns.

## Local Development

```bash
npm install
npm run start
```

The contribution UI works with mock API responses until server environment
variables are configured.

## Required Production Environment

Set these on Vercel for the API project:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_APP_INSTALLATION_ID`
- `GITHUB_REPO_OWNER`
- `GITHUB_REPO_NAME`
- `GITHUB_BASE_BRANCH`
- `SESSION_SECRET`
- `GEMINI_API_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `ALLOWED_ORIGINS`
- `CONTRIBUTOR_REDIRECT_URL`

For a GitHub Pages frontend talking to a separate Vercel API, build the site
with `LOREWIKI_API_BASE_URL=https://your-vercel-project.vercel.app`.

Repository: https://github.com/suisarbre/protocol-do-not-jump

Deployment and WAF setup are documented in `docs/ops/deployment.md`.
