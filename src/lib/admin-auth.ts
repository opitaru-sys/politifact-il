/**
 * Cookie-based admin authentication. Replaces the legacy `?key=` URL
 * pattern that was flagged HIGH in the 2026-05-26 security audit
 * (URL params leak via referrer headers, server logs, CDN logs,
 * browser history, and screenshots).
 *
 * Flow:
 *   1. Editor visits /admin/login, enters the secret.
 *   2. /admin/login server action validates + setAdminCookie() — an
 *      httpOnly Cookie with the secret value, scoped to /admin only.
 *   3. Every admin page calls requireAdmin() (redirects to login if
 *      cookie missing/wrong). Server actions call assertAdmin().
 *
 * Legacy bootstrap: if a request to /admin/* still carries `?key=` in
 * the URL with the correct secret, the page sets the cookie and
 * redirects to the same URL minus the query string. So old bookmarks
 * keep working for one visit, and the key leaves the URL bar after
 * the first navigation. Wrong-key visits redirect to /admin/login.
 *
 * Why store the secret itself in the cookie (rather than a derived
 * session token):
 *   - The cookie is httpOnly + secure + sameSite=strict + path=/admin
 *     scoped. XSS can't read it, CSRF can't reuse it cross-site, and
 *     it never leaves the admin tree.
 *   - No session-storage table needed. The site is single-editor
 *     today; a multi-editor refactor would justify session rows but
 *     this gets us off URL params with the minimum change.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "badak_admin";
const COOKIE_MAX_AGE = 60 * 60 * 8; // 8 hours

/** Currently-set cookie value, or null. */
export async function getAdminCookieValue(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
}

/** True iff the cookie matches ADMIN_SECRET. */
export async function isAdmin(): Promise<boolean> {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  const value = await getAdminCookieValue();
  return value === secret;
}

/**
 * Page-level guard: redirects to /admin/login if not authenticated.
 * Use at the top of every admin page server component.
 */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}

/**
 * Server-action guard: throws if not authenticated. Server actions
 * should fail loud (uncaught error → user sees a generic error
 * boundary) rather than silently no-oping.
 */
export async function assertAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new Error("Unauthorized");
}

export async function setAdminCookie(): Promise<void> {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) throw new Error("ADMIN_SECRET not configured");
  const store = await cookies();
  store.set(COOKIE_NAME, secret, {
    httpOnly: true,
    // Only require HTTPS in production — local dev runs on http://localhost
    // and the secure flag would prevent the cookie being set there at all.
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function clearAdminCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/**
 * Legacy `?key=` bootstrap. Call from each admin page BEFORE the
 * requireAdmin() check. If the URL carries a valid `?key=`, we set
 * the cookie and redirect to the same path without the key so the
 * secret leaves the URL bar. If `?key=` is present but wrong, we
 * redirect to login (don't leak the path).
 *
 * Returns void on bootstrap (the redirect throws out of this function).
 * Returns void otherwise too — caller should follow up with
 * `await requireAdmin()`.
 */
export async function bootstrapLegacyKey(
  searchParams: { key?: string } | undefined,
  pathname: string,
): Promise<void> {
  const key = searchParams?.key;
  if (!key) return;
  if (key === process.env.ADMIN_SECRET) {
    await setAdminCookie();
    redirect(pathname); // strip the key from the URL
  } else {
    redirect("/admin/login");
  }
}
