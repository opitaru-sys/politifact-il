/**
 * Telegram channels we ingest as primary sources.
 *
 * Each entry maps a public Telegram channel to a politician we already
 * have in `NAME_TO_ID` (`rss-feeds.ts`). Posts are fetched from
 * `https://t.me/s/<handle>` — Telegram's built-in public web preview
 * which returns the channel's recent messages as HTML, no auth.
 *
 * Why this is its own list (not in RSS_FEEDS):
 *  - The fetch path is different (HTML scraping, not RSS parsing).
 *  - Each channel has a guaranteed single author, so we can wrap each
 *    post's content with an explicit attribution preamble before it
 *    reaches the extractor. RSS articles don't have that property.
 *
 * Coverage bias to flag honestly: Israeli politicians who maintain
 * official Telegram channels skew right-wing / coalition. Lapid,
 * Gantz, Bennett, Liberman, the Arab parties — most use X primarily
 * and don't keep an active Telegram presence. So this source will
 * pull in disproportionately more right-wing material until / unless
 * the picture changes. The site's non-partisan framing should not be
 * read as guaranteeing equal source coverage per faction; we cover
 * whoever publishes publicly.
 */
export interface TelegramSource {
  /** Telegram channel handle (without @). Used to build t.me/s/<handle>. */
  handle: string;
  /** politicianId from NAME_TO_ID — the author of every post on the channel. */
  politicianId: string;
  /** Hebrew display name — used in the source label and in the
   *  attribution preamble we prepend to each post's content. */
  politicianName: string;
}

// Discovered via scripts/_discover-tg.mts on 2026-05-17 — probed
// plausible handle variants for every politician in NAME_TO_ID and
// kept channels with 4+ visible posts. Coverage skews coalition (10
// of 14 Likud ministers have channels) and right-wing. Missing across
// the spectrum: all Haredi parties (Yahadut HaTorah, most of Shas),
// Liberman, Arab parties, Labor, Noam — these constituencies use
// other platforms or don't maintain public Telegram presence.
export const TELEGRAM_SOURCES: TelegramSource[] = [
  // Likud — coalition, heaviest coverage
  { handle: "bnetanyahu", politicianId: "netanyahu", politicianName: "בנימין נתניהו" },
  { handle: "YarivLevin", politicianId: "yariv-levin", politicianName: "יריב לוין" },
  { handle: "ohana_amir", politicianId: "amir-ohana", politicianName: "אמיר אוחנה" },
  { handle: "nbarkat", politicianId: "nir-barkat", politicianName: "ניר ברקת" },
  { handle: "katz_israel", politicianId: "israel-katz", politicianName: "ישראל כץ" },
  { handle: "shlomo_karhi", politicianId: "shlomo-karhi", politicianName: "שלמה קרעי" },
  { handle: "MiriRegev", politicianId: "miri-regev", politicianName: "מירי רגב" },
  { handle: "MikiZohar", politicianId: "miki-zohar", politicianName: "מיקי זוהר" },
  { handle: "yoav_kisch", politicianId: "yoav-kisch", politicianName: "יואב קיש" },
  { handle: "amichai_chikli", politicianId: "amichai-chikli", politicianName: "עמיחי שיקלי" },
  { handle: "idit_silman", politicianId: "idit-silman", politicianName: "עידית סילמן" },
  { handle: "galitdistel", politicianId: "galit-distel", politicianName: "גלית דיסטל" },
  { handle: "may_golan", politicianId: "may-golan", politicianName: "מאי גולן" },
  { handle: "kallner", politicianId: "ariel-kallner", politicianName: "אריאל קלנר" },

  // Religious Zionism
  { handle: "bezalel_smotrich", politicianId: "smotrich", politicianName: "בצלאל סמוטריץ'" },
  { handle: "ofir_sofer", politicianId: "ofir-sofer", politicianName: "אופיר סופר" },

  // Otzma Yehudit
  { handle: "bengvir", politicianId: "ben-gvir", politicianName: "איתמר בן גביר" },

  // Shas
  { handle: "AryeDeri", politicianId: "deri", politicianName: "אריה דרעי" },

  // Tikva Hadasha
  { handle: "GideonSaar", politicianId: "saar", politicianName: "גדעון סער" },
  { handle: "zeev_elkin", politicianId: "zeev-elkin", politicianName: "זאב אלקין" },
  { handle: "sharrenhaskel", politicianId: "sharren-haskel", politicianName: "שרן השכל" },

  // Mahane Mamlachti (opposition)
  { handle: "Eisenkot", politicianId: "eisenkot", politicianName: "גדי איזנקוט" },

  // Yesh Atid (opposition)
  { handle: "ylapid", politicianId: "lapid", politicianName: "יאיר לפיד" },
  // Politicians probed but with no discovered handle (coverage gap, not error):
  //   gantz, bennett, lieberman, michaeli, abbas, odeh, ahmad-tibi,
  //   ofer-cassif, goldknopf, gafni, porush, gallant, eli-cohen,
  //   yuli-edelstein, amsalem, david-bitan, haim-katz, gila-gamliel,
  //   ofir-katz, gottlieb, bismuth, vaturi, sofer (others), strook,
  //   rothman, sukkot, all of Yahadut HaTorah, etc.
  // Add if/when they create a channel — re-run scripts/_discover-tg.mts
  // periodically.
];

/** Source string we store on Article rows for Telegram posts. */
export function telegramSourceLabel(politicianName: string): string {
  return `טלגרם · ${politicianName}`;
}

/** All Telegram source labels. Mirrors RSS_SOURCE_NAMES in fact-check.ts so
 *  the fresh-news lane can include both RSS and Telegram in one filter. */
export const TELEGRAM_SOURCE_NAMES: string[] = TELEGRAM_SOURCES.map((s) =>
  telegramSourceLabel(s.politicianName),
);

/** Public URL of a specific post — what we save to Article.url. */
export function telegramPostUrl(handle: string, postId: string): string {
  return `https://t.me/${handle}/${postId}`;
}
