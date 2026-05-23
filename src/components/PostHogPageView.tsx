"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";

/**
 * Manual pageview tracker for the App Router. Next.js client-side
 * navigations don't fire a full page load, so PostHog's auto-pageview
 * misses them — without this, you'd only ever see the first URL a
 * visitor lands on. The `capture_pageview: false` setting in the
 * provider hands the job to this component.
 *
 * Re-runs on any pathname or searchParams change so `?window=` /
 * `?politician=` filter changes are captured as distinct pageviews
 * (useful for understanding which filters people actually use).
 *
 * MUST be rendered inside a `<Suspense>` boundary because
 * `useSearchParams` suspends during the static-shell render — without
 * the boundary, the whole layout falls into a single Suspense that
 * blocks streaming.
 */
export function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const posthog = usePostHog();

  useEffect(() => {
    if (!pathname || !posthog) return;
    let url = window.origin + pathname;
    const qs = searchParams?.toString();
    if (qs) url += `?${qs}`;
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams, posthog]);

  return null;
}
