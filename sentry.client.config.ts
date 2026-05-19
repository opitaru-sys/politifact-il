// Sentry browser-side init. No-op when SENTRY_DSN is missing (local dev).
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1, // 10% of pageloads sampled for performance
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || "development",
  });
}
