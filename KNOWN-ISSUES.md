# Known Issues

## ANTHROPIC_API_KEY system env override (Windows)

**Symptom:** The pipeline (`/api/process`, `npm run daily`) returns "Could not resolve authentication method" even though `ANTHROPIC_API_KEY` is set in `.env.local`.

**Cause:** The user account has `ANTHROPIC_API_KEY=""` (empty string) set as a Windows user/system environment variable. Process-level env vars take precedence over `.env.local`, so the empty string wins and the Anthropic SDK throws.

**Fix:**

1. Check current state in PowerShell:
   ```powershell
   [Environment]::GetEnvironmentVariable("ANTHROPIC_API_KEY", "User")
   [Environment]::GetEnvironmentVariable("ANTHROPIC_API_KEY", "Machine")
   ```

2. Remove the empty override:
   ```powershell
   [Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", $null, "User")
   ```

3. Restart any open terminal / VS Code / Claude Code window so the change takes effect in new processes.

4. Verify `.env.local` is being read:
   ```powershell
   cd 'C:\Users\User\Desktop\ISR Politicians Fact Check\badak'
   npm run daily
   ```

   You should see `API key len: 108` in the output.

The `scripts/daily.mts` workaround does a manual `.env.local` parse and overrides only when the existing env var is empty/short — so it works even with the bad system env, but other code paths (the Next.js API routes) still fail.

## Three `dev.db` files exist

Only `prisma/dev.db` is the real one (116 politicians, 30+ claims). The other two are leftovers from earlier sessions:

- `dev.db` (root, 60KB) — old seed, 14 politicians, 0 articles
- `prisma/prisma/dev.db` — created when DATABASE_URL was misconfigured

Safe to delete the leftovers; `.env` points to `file:./dev.db` which Prisma resolves relative to the schema file (`prisma/`), giving `prisma/dev.db`.

## Daily ingest yields are low

General-news RSS feeds (Ynet, Walla, Maariv, Israel Hayom) yield ~1% direct politician quotes. Most articles are journalist commentary, which the extraction prompt correctly rejects.

To improve coverage, consider adding:
- Politicians' X/Twitter feeds (via nitter RSS bridges)
- Knesset plenary transcripts (knesset.gov.il publishes XML)
- Official party/ministry press releases
- Podcast transcripts (requires Whisper or similar)

Until those are wired up, the existing seed in `scripts/seed-real-claims.mjs` provides launch content.
