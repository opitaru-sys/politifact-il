# Deploy בדוק to production

Step-by-step. Estimated total time: 60-90 min of focused work, plus DNS propagation wait.

You'll be working through these external services:
- **Neon** (Postgres database) — free tier covers this site
- **Vercel** (hosting) — free hobby tier covers it
- **GitHub Actions** (daily ingest cron) — included with the GitHub repo, no extra account
- **Upstash** (Redis for rate limiting) — free tier, ~30 sec signup
- **Sentry** (error monitoring) — free tier, ~30 sec signup
- **Anthropic** (API key for AI) — you already have one

## 1. Set up Neon Postgres

1. Go to https://neon.tech, create a free project (region: closest to your users — `eu-central-1` for Israel).
2. From the project dashboard, copy the **"Pooled"** connection string. It looks like:
   ```
   postgresql://user:pass@ep-cool-name-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```
3. Save it somewhere safe — you'll paste it into Vercel + GitHub Actions secrets soon.
4. **Optional but recommended:** create a separate Neon "branch" called `dev` and use that connection string for local development (set in `.env.local`). Keeps prod data clean.

## 2. Migrate data from local SQLite → Neon Postgres

This copies your 107 published claims, 100+ articles, all politicians, and any reports/comments from `prisma/dev.db` into Neon. One-time operation.

```bash
# 1. Push the schema to Neon (creates the empty tables)
DATABASE_URL="postgresql://..." npm run db:gen
DATABASE_URL="postgresql://..." npm run db:push

# 2. Run the data migration
DATABASE_URL_POSTGRES="postgresql://..." npm run db:migrate
```

Expected output: `Politicians: 117, Articles: ~1000, Claims: 107, Comments: 1, Reports: 0`.

If the migration fails partway, it's idempotent — re-run and it'll skip already-migrated rows. Verify counts manually:
```bash
DATABASE_URL="postgresql://..." node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.claim.count().then(n=>{console.log('claims:',n);p.\$disconnect();});"
```

## 3. Generate the admin secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the 64-char hex string. You'll set it as `ADMIN_SECRET` in Vercel below.

## 4. Set up Upstash Redis (rate limiting)

1. https://upstash.com → sign up → "Create Database" → choose region near Neon.
2. Copy the `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

## 5. Set up Sentry (error monitoring)

1. https://sentry.io → sign up → "Create Project" → platform: Next.js → name: `badak`.
2. Copy the DSN. It looks like `https://abc...@...ingest.sentry.io/123`.

## 6. Deploy to Vercel

1. https://vercel.com → "Add New… → Project" → import `opitaru-sys/politifact-il` from GitHub.
2. Framework Preset should auto-detect as **Next.js**. Don't change.
3. **Don't deploy yet.** First add the env vars (Project Settings → Environment Variables). For each, set "Production" + "Preview" + "Development":

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Neon pooled connection string |
   | `ANTHROPIC_API_KEY` | your Anthropic key |
   | `ADMIN_SECRET` | the random hex from step 3 |
   | `NEXT_PUBLIC_SITE_URL` | `https://baduk.org.il` (or whatever domain) |
   | `UPSTASH_REDIS_REST_URL` | from step 4 |
   | `UPSTASH_REDIS_REST_TOKEN` | from step 4 |
   | `SENTRY_DSN` | from step 5 |
   | `NEXT_PUBLIC_SENTRY_DSN` | same as `SENTRY_DSN` |

4. Hit Deploy. First build takes 2-3 minutes. If it fails, check the build log — most issues are missing env vars.

## 7. Configure the daily ingest cron via GitHub Actions

The cron is already wired in `.github/workflows/daily-ingest.yml`. Add the secrets to GitHub:

1. Open your repo → Settings → Secrets and variables → Actions → "New repository secret".
2. Add two secrets:
   - `DATABASE_URL` — Neon connection string (same as Vercel)
   - `ANTHROPIC_API_KEY` — your Anthropic key

3. (Optional) Test it: Actions tab → "Daily fact-check ingest" → "Run workflow". Should take 10-20 min and complete green.

4. **Disable the local Windows scheduled task** to avoid duplicate runs:
   ```powershell
   Unregister-ScheduledTask -TaskName 'BadukDailyIngest' -Confirm:$false
   ```

## 8. Point the domain at Vercel

1. In Vercel: Project → Settings → Domains → "Add" → enter `baduk.org.il`.
2. Vercel shows the DNS records you need.
3. At your domain registrar, add the records Vercel asked for (usually an `A` record pointing to `76.76.21.21` plus a `CNAME` for `www`).
4. SSL is automatic — Vercel issues a cert via Let's Encrypt within minutes of DNS propagation.

## 9. Smoke test

After Vercel shows "Ready" with the custom domain:

- [ ] Homepage loads at `https://baduk.org.il`
- [ ] Leaderboard, parties, compare pages load
- [ ] Click a claim card → goes to `/claim/[id]`
- [ ] OG preview works: paste your homepage URL into WhatsApp / X — should show the בדוק masthead image
- [ ] `/admin/status?key=<your-admin-secret>` shows the dashboard
- [ ] `/robots.txt` returns the policy
- [ ] `/sitemap.xml` returns the sitemap
- [ ] Comment + report buttons work
- [ ] Manually trigger the GitHub Action and confirm new claims appear

## 10. Verify production AI cost is sane

The first GitHub Action run will cost ~$0.10-0.30 in API. Subsequent daily runs ~$0.05-0.20 (fewer new articles, but Knesset speeches happen during plenary weeks).

Set a budget alert in the Anthropic console (Settings → Billing → Usage limits) — I recommend $30/month soft cap.

## After launch

These items I deliberately left for later:

- **Legal review** of defamation exposure (calling MK statements "שקר"). I added a takedown policy in /about and a beta banner, but talking to a media-law attorney is worth doing before you publicly announce the site.
- **Corrections log page** — when you reject a verified claim via the report mechanism, a public-facing record of corrections builds trust.
- **Editorial advisory board** — one trusted name (academic, journalist, retired MK) reviewing the methodology page would meaningfully shift "single guy + AI" perception.
- **English version** — Hebrew-only limits international press / academic citation.
- **ISR caching strategy** — every page is currently `force-dynamic`. Switch the public pages to `revalidate = 600` once traffic justifies it.

## Rollback

If something is wrong post-deploy:
- **Code rollback:** Vercel → Deployments → click the previous deploy → "Promote to Production".
- **Data rollback:** Neon supports point-in-time restore for 7 days on the free tier (Branches → "Restore to point in time").
- **Disable ingest:** GitHub → Settings → Actions → disable the workflow.
- **Take site offline:** Vercel → Domains → temporarily remove the domain mapping.
