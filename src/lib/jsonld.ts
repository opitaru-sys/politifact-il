/**
 * Serialize an object for safe inlining inside a
 * <script type="application/ld+json"> block. `JSON.stringify` alone does
 * not escape `</` or the U+2028 / U+2029 line separators, so a value
 * containing `</script>...` could break out and execute attacker JS.
 * Route every inline JSON-LD payload through this. Mirrors the helper
 * the /claim page introduced in the 2026-05-26 security audit.
 */
export function safeJsonLd(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/-->/g, "--\\u003e")
    .replace(new RegExp("\\u2028", "g"), "\\u2028")
    .replace(new RegExp("\\u2029", "g"), "\\u2029");
}
