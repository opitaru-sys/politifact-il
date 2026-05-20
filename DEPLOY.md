# Deploy בדוק to production

Six steps left. Estimated 30 min of focused clicking, plus DNS propagation wait.

Open this file and check off each box as you go. Don't skip steps — env vars are interdependent.

---

## What's already done

- [x] **Neon Postgres project + dev branch created.** Connection string is in `.env.local` and `.env`.
- [x] **Data migrated.** 117 politicians, 1359 articles, 107 claims, 1 comment, 1 report copied from local SQLite to the Neon dev branch.
- [x] **GitHub Actions secrets added.** `DATABASE_URL` and `ANTHROPIC_API_KEY` are set on the `opitaru-sys/politifact-il` repo. The daily cron points at the same Neon dev branch.

Note on branches: for a beta launch I'm using a **single Neon branch (`dev`)** for everything — local dev, the cron, and (soon) the production Vercel deployment. Cleaner than splitting branches at this scale. When traffic justifies it, you can split into `production` + `dev` later (Neon makes that easy — see "Optional: split branches" at the bottom).

---

## Step 1 — Generate a strong ADMIN_SECRET *(1 min)*

The current value is `test-secret-123` which is obviously not safe for production. Replace it.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the 64-character hex string. You'll paste it into Vercel in Step 4. Don't put it in your local `.env.local` yet — keep using the test secret for local dev so it's clear which environment you're hitting.

- [ ] Copied a new `ADMIN_SECRET` value to a safe place (1Password / etc.)

---

## Step 2 — Set up Upstash Redis *(3 min)*

For rate limiting on comments and reports. Without it, the in-memory limiter doesn't work on serverless (each function instance has its own memory = no real protection).

1. Go to https://upstash.com → "Sign up" (free, GitHub login works).
2. Click "Create database":
   - Name: `badak-ratelimit`
   - Region: `Frankfurt` (closest to Neon EU)
   - Type: Regional
3. After it provisions, scroll to "REST API" section.
4. Copy two values:
   - `UPSTASH_REDIS_REST_URL` (looks like `https://something.upstash.io`)
   - `UPSTASH_REDIS_REST_TOKEN` (long base64 string)
5. Save them — they go into Vercel in Step 4.

- [ ] Upstash Redis created
- [ ] `UPSTASH_REDIS_REST_URL` saved
- [ ] `UPSTASH_REDIS_REST_TOKEN` saved

---

## Step 3 — Set up Sentry *(3 min)*

For error monitoring. Without it, production crashes will be invisible.

1. Go to https://sentry.io → "Sign up" (free, GitHub login works).
2. After signup, choose **"Next.js"** as your platform.
3. Create a project named `badak`.
4. Sentry shows you a DSN string. It looks like:
   ```
   https://abc123def456@o12345.ingest.us.sentry.io/678
   ```
5. Copy it. You'll set this as **both** `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` in Vercel.

You can skip the "wizard" Sentry suggests — we've already wired up the SDK in code. Just need the DSN.

- [ ] Sentry project created
- [ ] DSN saved

---

## Step 4 — Deploy to Vercel *(10 min)*

This is the big one. The site goes live at the end of this step.

1. Go to https://vercel.com → "Sign up" with GitHub.
2. Once in, click **"Add New… → Project"**.
3. Find `opitaru-sys/politifact-il` in the list, click **"Import"**.
4. **Framework Preset** auto-detects as Next.js. Don't change.
5. **Before clicking Deploy**, expand the "Environment Variables" section. Add each of these (leave the scope on Vercel's default — "Production and Preview" is correct; "Development" is only used by the `vercel dev` CLI which we don't use):

   | Variable | Value | Where it came from |
   |---|---|---|
   | `DATABASE_URL` | Your full Neon connection string (the one in `.env.local`) | Step 1 of "What's already done" |
   | `ANTHROPIC_API_KEY` | Your Anthropic API key (same as `.env.local`) | Existing |
   | `ADMIN_SECRET` | The new hex from Step 1 above | Step 1 of this checklist |
   | `NEXT_PUBLIC_SITE_URL` | `https://bduk.co.il` (or whatever domain you'll use) | You decide |
   | `UPSTASH_REDIS_REST_URL` | From Step 2 | Upstash |
   | `UPSTASH_REDIS_REST_TOKEN` | From Step 2 | Upstash |
   | `SENTRY_DSN` | From Step 3 | Sentry |
   | `NEXT_PUBLIC_SENTRY_DSN` | Same as `SENTRY_DSN` | Sentry |

6. Click **"Deploy"**.
7. First build takes 2–3 minutes. Vercel shows logs live. If it fails, the log will tell you which env var is missing or wrong.
8. When it shows "Ready", click the preview link. You'll see the site running on a `*.vercel.app` URL.

- [ ] Imported repo into Vercel
- [ ] Added all 8 env vars
- [ ] Deploy succeeded
- [ ] Opened the `*.vercel.app` URL and saw the homepage

---

## Step 5 — Point your domain at Vercel *(5 min config + DNS propagation)*

Only do this if you actually own the domain. If not, skip — you can launch on the `*.vercel.app` subdomain.

1. In Vercel: your project → **Settings → Domains** → "Add Domain".
2. Enter `bduk.co.il` (or whatever you own).
3. Vercel shows you DNS records to add. Usually:
   - `A` record on `@` → `76.76.21.21`
   - `CNAME` record on `www` → `cname.vercel-dns.com`
4. Add those records at your domain registrar (GoDaddy, Namecheap, Israeli registrar, wherever you bought it).
5. Vercel will detect propagation and auto-issue a Let's Encrypt SSL cert. Usually within 10 min, sometimes longer.

- [ ] Domain added in Vercel
- [ ] DNS records added at registrar
- [ ] Domain shows ✅ green checkmark in Vercel
- [ ] `https://bduk.co.il` loads with valid SSL

---

## Step 6 — Smoke test *(5 min)*

After Vercel is green and the domain works:

- [ ] Homepage loads
- [ ] `/leaderboard` shows ranked politicians with stats
- [ ] `/parties` shows party comparison
- [ ] `/compare` works (try picking two politicians)
- [ ] Click any claim card → goes to `/claim/[id]`
- [ ] `/admin/status?key=<your-new-admin-secret>` shows the dashboard
- [ ] `/robots.txt` returns the rules
- [ ] `/sitemap.xml` returns the sitemap (107+ URLs)
- [ ] OG preview works: paste the homepage URL into WhatsApp / X — should show the בדוק masthead
- [ ] Post a test comment → succeeds. Post 6 rapidly → 6th gets rate-limited with 429
- [ ] Trigger Sentry: hit a URL like `/api/comment?claimId=does-not-exist` — should generate a Sentry event in your dashboard

- [ ] All smoke tests passed

---

## Done!

Once Step 6 is checked off, **you're live**.

The daily ingest cron is already running (it fired at 06:00 UTC today — was failing for missing secrets, those have been added, you can re-run manually from the Actions tab and it should succeed now). New claims will appear automatically over the coming days as politicians make public statements.

---

## After launch — not blocking, but worth doing soon

These I deliberately left out of the launch checklist because they aren't required to *be* live, but they're worth doing in the first week or two:

- **Disable the local Windows scheduled task.** Now that GitHub Actions runs the cron, you don't want both. `Unregister-ScheduledTask -TaskName 'BadukDailyIngest' -Confirm:$false` in PowerShell.
- **Rotate the dev Neon credential.** You pasted it into a Claude chat. Easy to rotate: Neon dashboard → Branches → dev → Reset password. Then update `.env.local` and `.env`, and the GitHub secret (`gh secret set DATABASE_URL --repo opitaru-sys/politifact-il`).
- **Set an Anthropic budget alert.** Console → Settings → Billing → Usage limits. Suggest $30/month soft cap.
- **Set Sentry alert rules.** "Email me if any error in production".
- **Spot-check 10–20 claims by hand.** None of the AI-extracted claims have human review yet. Pick a few from `/leaderboard`, read them, flip any that look wrong using the "report" button.
- **Talk to someone about defamation exposure.** The beta banner and takedown policy lower the risk but don't eliminate it. Worth a 30-min call with a media lawyer before any kind of PR push.

---

## Optional: split branches later

Right now everything points at the Neon `dev` branch. When traffic justifies it (or sooner if you want safer dev), split:

1. In Neon dashboard, the existing branch is misnamed `dev` for what's actually serving production. Rename it to `production` (Neon supports renames).
2. Create a new branch called `dev` from `production` ("Branch data and schema" so it has a snapshot).
3. Update local `.env.local` and `.env` `DATABASE_URL` to point at the new `dev` branch.
4. Leave Vercel and GitHub Actions secrets pointing at `production` (no changes needed if you renamed the original).
5. From now on, your local code reads/writes the dev branch and never touches production.

---

## Rollback

If something is wrong post-deploy:
- **Code rollback:** Vercel → Deployments → click the previous deploy → "Promote to Production".
- **Data rollback:** Neon supports point-in-time restore for 7 days on free tier (Branches → "Restore to point in time").
- **Disable cron:** GitHub → Actions tab → "Daily fact-check ingest" → "Disable workflow".
- **Take site offline:** Vercel → Domains → temporarily remove the domain mapping.
