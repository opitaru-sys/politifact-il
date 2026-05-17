# Baduk (בדוק) — Project State

## What This Is
A viral Israeli politician fact-checking website. Inspired by the "when to shower" (canishower.com) site from the Iran war. Name "בדוק" means "checked/verified" and evokes "בדיקת עובדות".

## Core Concept
- "שקרן השבוע" (Liar of the Week) hero section — rolling 7-day window
- Credibility leaderboard ranking politicians by truth percentage
- Claim cards with 3-level verdicts: אמת / חצי אמת / שקר
- Party comparison page
- Politician profile pages with full claim history
- WhatsApp-optimized share cards (not yet implemented)
- Hebrew-first, RTL, mobile-first design
- Uses Rubik font (Google Fonts) for proper Hebrew rendering

## Tech Stack
- Next.js 16 (App Router, Turbopack)
- Tailwind CSS v4
- Prisma v5 + SQLite (prisma/dev.db)
- rss-parser for RSS feed ingestion
- @anthropic-ai/sdk for AI fact-checking pipeline
- better-sqlite3 for seed scripts

## Database (prisma/dev.db)
- **Politician** — 14 seeded (Netanyahu, Lapid, Smotrich, Ben Gvir, Gantz, Lieberman, Deri, Gallant, Sa'ar, Eisenkot, Goldknopf, Michaeli, Abbas, Odeh)
- **Claim** — empty (needs ANTHROPIC_API_KEY to process articles)
- **Article** — 10 real articles ingested from today's Israeli news

## File Structure
```
badak/
├── .env                          # DATABASE_URL, ADMIN_SECRET, ANTHROPIC_API_KEY
├── prisma/
│   ├── schema.prisma             # DB schema (Prisma v5, prisma-client-js)
│   ├── dev.db                    # SQLite database (THE correct one)
│   └── seed.mjs                  # Politician seeder script
├── src/
│   ├── app/
│   │   ├── layout.tsx            # Root layout (RTL, Rubik font, header/nav/footer)
│   │   ├── page.tsx              # Homepage (async, uses lib/data.ts)
│   │   ├── globals.css           # Tailwind + custom theme vars
│   │   ├── leaderboard/page.tsx  # Full leaderboard
│   │   ├── parties/page.tsx      # Party comparison
│   │   ├── politician/[id]/page.tsx  # Politician profile
│   │   └── api/
│   │       ├── ingest/route.ts   # POST: fetch RSS feeds, store articles
│   │       └── process/route.ts  # POST: AI extract+factcheck claims
│   ├── components/
│   │   ├── ClaimCard.tsx         # Claim display with verdict badge + fact source link
│   │   ├── VerdictBadge.tsx      # Color-coded verdict badge
│   │   ├── LiarOfTheWeek.tsx     # Hero section (receives stats as props)
│   │   ├── LeaderboardPreview.tsx # Top 5 preview (receives stats as props)
│   │   └── SearchBar.tsx         # Client component, politician/party search
│   ├── data/
│   │   └── mock.ts               # Mock data fallback (12 claims, 8 politicians)
│   └── lib/
│       ├── db.ts                 # Prisma client singleton
│       ├── data.ts               # Data layer: uses DB if claims exist, else mock
│       ├── queries.ts            # Prisma query functions
│       ├── ingest.ts             # RSS feed fetcher
│       ├── fact-check.ts         # AI claim extraction + fact-checking
│       └── rss-feeds.ts          # Feed URLs + politician name mappings
```

## Key Design Decisions
- Mock data fallback: site works without DB claims, auto-switches when real data exists
- RSS feeds that work: Ynet, Maariv, Israel Hayom. Calcalist returns 403, Walla politics 404.
- AI pipeline produces claims with confidence scores; only >=0.7 auto-publishes
- Homepage: "שקרן השבוע" + leaderboard side-by-side (md:grid-cols-2), search below, claims feed below that
- All pages use `export const dynamic = "force-dynamic"` for fresh DB reads
- LiarOfTheWeek and LeaderboardPreview receive stats as props (computed once in page)

## What's NOT Done Yet
- [ ] WhatsApp share cards (OG images)
- [ ] Author credit in footer (Omri Pitaru, links to X + LinkedIn)
- [ ] ANTHROPIC_API_KEY not set — AI pipeline untested end-to-end
- [ ] No user submissions
- [ ] No dark mode
- [ ] No real politician photos (using first-letter avatars)
- [ ] No cron/scheduled ingestion — manual API calls only

## Author
Omri Pitaru — https://x.com/opitaru — https://www.linkedin.com/in/omripitaru/
