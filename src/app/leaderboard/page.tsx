import type { Metadata } from "next";
import {
  getPoliticianStats,
  getUnrankedPoliticians,
  getKnessetActivityMap,
} from "@/lib/data";
import { getDataCollectionStart } from "@/lib/queries";
import { PoliticianAvatar } from "@/components/PoliticianAvatar";
import { WindowSelector } from "@/components/WindowSelector";
import { resolveWindow, windowLabel as windowLabelFn } from "@/lib/window";
import { safeJsonLd } from "@/lib/jsonld";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://bduk.co.il";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "טבלת ההטעיות | בדוק",
  description: "דירוג פוליטיקאים ישראליים לפי כמה הטעו את הציבור — שקרים והטעיות שנבדקו עובדתית",
  alternates: { canonical: "/leaderboard" },
};

interface PageProps {
  searchParams: Promise<{ window?: string }>;
}

export default async function LeaderboardPage({ searchParams }: PageProps) {
  const { window: windowParam } = await searchParams;
  const selected = resolveWindow(windowParam);

  const [ascending, unranked, collectionStart, activityMap] = await Promise.all([
    getPoliticianStats(selected.days),
    getUnrankedPoliticians(selected.days),
    getDataCollectionStart(),
    getKnessetActivityMap(),
  ]);

  // Rank by the weighted lie score, most misleading at the top (getPoliticianStats
  // already orders this way; re-sort defensively). Participation % is an info
  // column, not a filter — every qualifying MK appears.
  const stats = [...ascending].sort(
    (a, b) => b.lieScore - a.lieScore || b.falseClaims - a.falseClaims,
  );

  const windowLabel = windowLabelFn(selected.value);

  // ItemList structured data — helps Google understand this is a ranked
  // list and may surface individual list items in rich results.
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `דירוג פוליטיקאים לפי הטעיות · ${windowLabel}`,
    description: "דירוג פוליטיקאים ישראליים לפי ניקוד הטעיה עובדתי",
    url: `${SITE_URL}/leaderboard`,
    numberOfItems: stats.length,
    itemListElement: stats.slice(0, 20).map((stat, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}/politician/${stat.politician.id}`,
      name: stat.politician.name,
    })),
  };

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(itemListJsonLd) }}
      />
      <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold mb-2">
        דירוג · {windowLabel}
      </div>
      <h1 className="text-4xl font-black mb-3 tracking-tight">מי מטעה הכי הרבה</h1>
      <p className="text-sm text-foreground-muted mb-3 max-w-2xl leading-relaxed">
        דירוג של {stats.length} פוליטיקאים לפי <strong className="text-foreground">כמה הטעו את הציבור</strong>
        {" "}<span className="text-foreground font-bold">{windowLabel === "מכל הזמנים" ? "בכל הזמנים" : `ב-${windowLabel}`}</span>.
        המספר הגדול הוא <span className="text-foreground font-bold">ניקוד הטעיה</span>: כל טענת שקר שווה נקודה, כל חצי-אמת חצי נקודה. ככל שהניקוד גבוה יותר, הפוליטיקאי הפיץ יותר מידע מוטעה.
        אחוז האמת <span className="text-foreground font-bold">(אמת + ½ × חצי) ÷ סה״כ</span> מוצג כקו תחתון.
        עמודת <span className="text-foreground font-bold">השתתפות</span> מציגה את אחוז ישיבות המליאה ב-90 הימים האחרונים שבהן הח״כ דיבר.
      </p>
      <p className="text-[11px] text-foreground-muted mb-6 max-w-2xl leading-relaxed">
        הניקוד מודד <strong>דיוק עובדתי</strong> בלבד — לא יושרה, מוסריות, שחיתות, הסתה או איכות פוליטית.
        דעות, קללות, ברכות וסיסמאות סוננו ולא נספרו. פוליטיקאים שמדברים יותר נבדקים יותר, ולכן עשויים לצבור ניקוד גבוה יותר.
      </p>

      {/* Window selector — shared component, same options on the home
          page and politician profile so visitors compare apples-to-
          apples. */}
      <div className="mb-6">
        <WindowSelector basePath="/leaderboard" selectedValue={selected.value} />
      </div>

      {/* Data-since anchor */}
      {collectionStart && (
        <p className="text-[11px] text-foreground-muted mb-6 -mt-2">
          איסוף הנתונים מתחיל ב-
          <strong className="text-foreground tabular-nums">
            {collectionStart.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })}
          </strong>
          . הטבלה הנוכחית מציגה {windowLabel}.
        </p>
      )}

      <div
        className="bg-card border border-border-strong overflow-hidden"
        style={{ borderRadius: 4 }}
      >
        <div className="grid grid-cols-[2rem_1fr_auto] sm:grid-cols-[2rem_1fr_auto_auto_auto] gap-x-4 px-5 py-2.5 border-b-[1.5px] border-border-strong text-[10px] font-bold text-foreground-muted uppercase tracking-[0.18em]">
          <span>#</span>
          <span>פוליטיקאי</span>
          <span>הטעיות</span>
          <span className="hidden sm:inline">השתתפות</span>
          <span className="hidden sm:inline">טענות</span>
        </div>
        <ol>
          {stats.map((stat, i) => {
            const activity = activityMap.get(stat.politician.id);
            return (
              <li key={stat.politician.id} className="border-b border-border last:border-b-0">
                <a
                  href={`/politician/${stat.politician.id}`}
                  className="grid grid-cols-[2rem_1fr_auto] sm:grid-cols-[2rem_1fr_auto_auto_auto] gap-x-4 items-center px-5 py-3 hover:bg-muted/40 transition-colors"
                >
                  <span className="text-base font-black text-foreground-muted tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="flex items-center gap-3 min-w-0">
                    <PoliticianAvatar
                      id={stat.politician.id}
                      name={stat.politician.name}
                      image={stat.politician.image}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <div className="font-bold text-sm truncate">{stat.politician.name}</div>
                      <div className="text-[11px] text-foreground-muted truncate">
                        {stat.politician.party}
                        <span className="sm:hidden"> · {stat.totalClaims} טענות</span>
                      </div>
                    </div>
                  </div>
                  <div
                    className="text-left"
                    title={`ניקוד הטעיה: ${stat.lieScore} (שקר=1, חצי-אמת=0.5). ${stat.truthPercentage}% אמת מתוך ${stat.totalClaims} טענות.`}
                  >
                    <div
                      className="font-black text-xl tabular-nums leading-none"
                      style={{ color: "var(--verdict-false)" }}
                    >
                      {stat.lieScore}
                    </div>
                    <div className="text-[10px] tabular-nums text-foreground-muted/80 mt-0.5">
                      {stat.truthPercentage}% אמת
                    </div>
                  </div>
                  <div
                    className="hidden sm:block text-sm font-bold tabular-nums text-foreground-muted text-center min-w-[3.5rem]"
                    title={
                      activity
                        ? `${activity.plenumSessionsSpoken} מתוך ${activity.plenumSessionsTotal} ישיבות מליאה ב-90 הימים האחרונים`
                        : "אין נתוני השתתפות"
                    }
                  >
                    {activity ? `${Math.round(activity.plenumParticipationPct)}%` : "—"}
                  </div>
                  <div className="hidden sm:flex gap-1 text-[11px] font-bold tabular-nums">
                    <span
                      className="px-1.5 py-0.5"
                      style={{
                        backgroundColor: "var(--verdict-false-bg)",
                        color: "var(--verdict-false)",
                        borderRadius: 2,
                      }}
                    >
                      {stat.falseClaims}
                    </span>
                    <span
                      className="px-1.5 py-0.5"
                      style={{
                        backgroundColor: "var(--verdict-half-bg)",
                        color: "var(--verdict-half)",
                        borderRadius: 2,
                      }}
                    >
                      {stat.halfTrueClaims}
                    </span>
                    <span
                      className="px-1.5 py-0.5"
                      style={{
                        backgroundColor: "var(--verdict-true-bg)",
                        color: "var(--verdict-true)",
                        borderRadius: 2,
                      }}
                    >
                      {stat.trueClaims}
                    </span>
                  </div>
                </a>
              </li>
            );
          })}
        </ol>
      </div>


      {unranked.length > 0 && (
        <section className="mt-12">
          <div className="flex items-baseline justify-between mb-4 pb-3 border-b-[1.5px] border-border-strong">
            <h2 className="font-black text-lg tracking-tight">פוליטיקאים שטרם נדרגו</h2>
            <span className="text-[11px] tracking-wider uppercase text-foreground-muted">
              {unranked.length} ב-DB · אין טענות שנבדקו ב{windowLabel}
            </span>
          </div>
          <p className="text-[12px] text-foreground-muted leading-relaxed mb-5 max-w-2xl">
            פוליטיקאים שמופיעים במאגר אך לא נמצאה להם טענה ב{windowLabel}. הם יופיעו בטבלה ברגע שתופיע ציטוט שלהם בכתבה או בכנסת.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {unranked.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 px-3 py-2 bg-card border border-border"
                style={{ borderRadius: 4 }}
                title={`${p.name} · ${p.party}`}
              >
                <PoliticianAvatar id={p.id} name={p.name} image={p.image} size="sm" />
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate">{p.name}</div>
                  <div className="text-[10px] text-foreground-muted truncate uppercase tracking-wider">
                    {p.party}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
