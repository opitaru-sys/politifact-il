/**
 * Admin login. Replaces the `?key=` URL pattern. Renders a single
 * password input + submit; loginAction validates the secret, sets
 * the httpOnly cookie, and redirects to /admin/status.
 *
 * If already authenticated, redirects straight to /admin/status so
 * a bookmarked /admin/login doesn't waste a click.
 */
import type { Metadata } from "next";
import { isAdmin } from "@/lib/admin-auth";
import { redirect } from "next/navigation";
import { loginAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "כניסת אדמין | בדוק",
};

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function AdminLoginPage({ searchParams }: PageProps) {
  if (await isAdmin()) redirect("/admin/status");

  const { error } = await searchParams;
  const errorMessage =
    error === "bad"
      ? "סיסמה שגויה."
      : error === "empty"
        ? "יש להזין סיסמה."
        : null;

  return (
    <div className="max-w-sm mx-auto py-12">
      <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold mb-2">
        אדמין · כניסה
      </div>
      <h1 className="text-2xl font-black mb-6 tracking-tight">כניסת אדמין</h1>

      <form action={loginAction} className="space-y-4">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-wider font-bold text-foreground-muted mb-1.5">
            סיסמת אדמין
          </span>
          <input
            type="password"
            name="secret"
            autoFocus
            autoComplete="current-password"
            required
            className="w-full px-3 py-2 bg-background border border-border-strong text-sm focus:border-accent focus:outline-none"
            style={{ borderRadius: 2 }}
          />
        </label>

        {errorMessage && (
          <p
            className="text-xs px-3 py-2"
            style={{
              color: "var(--verdict-false)",
              backgroundColor: "var(--verdict-false-bg)",
              borderRadius: 2,
            }}
          >
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          className="w-full bg-foreground text-background px-4 py-2.5 text-sm font-bold hover:opacity-90 transition-opacity"
          style={{ borderRadius: 2 }}
        >
          התחבר
        </button>
      </form>

      <p className="text-[11px] text-foreground-muted mt-6 leading-relaxed">
        העוגייה תקפה ל-8 שעות. ניתן להתנתק מכל עמוד אדמין דרך הקישור בנאוויגציה.
      </p>
    </div>
  );
}
