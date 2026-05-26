import type { NextConfig } from "next";

/**
 * Security headers added 2026-05-26 after a white-box audit flagged
 * the empty config. Each header explained inline.
 *
 * CSP is shipped in REPORT-ONLY mode initially so we can observe
 * violations (in `report-uri` logs or the browser console) without
 * breaking PostHog, Next.js's font CSS, inline JSON-LD scripts, etc.
 * Once we've watched for a week or two and tuned the directives,
 * flip the header name to `Content-Security-Policy` for enforcement.
 */
const SECURITY_HEADERS = [
  // Force HTTPS, including subdomains. `preload` is required for
  // browser preload list inclusion. Long max-age (2 years) is the
  // standard for production sites.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Prevent MIME type sniffing — the browser respects the
  // Content-Type we send rather than guessing.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Clickjacking defense: forbid all iframing of our pages. The
  // CSP `frame-ancestors` directive below duplicates this for
  // modern browsers; X-Frame-Options remains for older ones.
  { key: "X-Frame-Options", value: "DENY" },
  // Don't leak full URLs to outbound sites. Critical because admin
  // pages still carry the secret in the URL query string today
  // (separate audit finding, addressed in the cookie-auth refactor).
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Disable powerful features by default; opt-in per-feature if
  // ever needed.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // CSP report-only — observe violations first, enforce after tuning.
  // Allowances:
  //   - inline scripts: needed for the JSON-LD ClaimReview block
  //     (sanitized via safeJsonForScript) and Next.js's flight
  //     payloads. We accept the risk; the audit also added the
  //     escape helper as defense in depth.
  //   - PostHog: analytics endpoint + script + connect
  //   - Vercel: their insights / analytics if/when enabled
  //   - data: URLs for img — used by some inline avatar fallbacks
  //   - https: for img — politician photos may be served from
  //     external sources (Knesset OData, news sites)
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://us-assets.i.posthog.com https://us.i.posthog.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: https:",
      "connect-src 'self' https://us.i.posthog.com https://us-assets.i.posthog.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply to every route. Headers are merged with Next.js defaults
        // (e.g. `x-powered-by`) which are themselves disabled at runtime.
        source: "/(.*)",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
