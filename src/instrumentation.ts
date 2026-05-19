// Next.js entrypoint for runtime initialization. Loads Sentry config based
// on which runtime the route uses (node vs edge). No-op when SENTRY_DSN is
// missing — Sentry's `init` itself skips when DSN is unset, but we also
// guard the imports so the bundle stays small in dev.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}
