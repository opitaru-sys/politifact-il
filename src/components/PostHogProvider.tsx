"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { PostHogProvider as PHProviderInner } from "posthog-js/react";

/**
 * PostHog analytics provider — wraps the app so any client component
 * can call `usePostHog()` to capture custom events.
 *
 * Init happens in a useEffect so it runs once on the client (never
 * during SSR), and is silently skipped if `NEXT_PUBLIC_POSTHOG_KEY`
 * is not set. That means local dev without the env var is a no-op —
 * nothing pings PostHog, no console noise.
 *
 * Manual pageview capture (`capture_pageview: false`) is on purpose:
 * Next.js client navigations don't trigger full page loads, so we
 * track route changes ourselves in `PostHogPageView` instead.
 *
 * `person_profiles: "identified_only"` means PostHog will only spin
 * up a long-lived user profile when we explicitly call `identify()`
 * — which we never do, since the site has no login. The net effect:
 * we get anonymous session events (page views, clicks) but no
 * persistent per-person tracking, which keeps the privacy posture
 * cleaner for a public fact-checking site.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return; // Local dev / preview without the key — no-op.
    posthog.init(key, {
      api_host:
        process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      capture_pageview: false,
      capture_pageleave: true,
      person_profiles: "identified_only",
      // Keep the default localStorage-backed persistence so PostHog can
      // tell sessions apart. No login means no cross-device identity;
      // we just need "is this the same tab as 30s ago".
    });
  }, []);

  return <PHProviderInner client={posthog}>{children}</PHProviderInner>;
}
