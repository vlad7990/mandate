/**
 * HTML escaping for composed email bodies.
 *
 * Split out of `send.ts` (126) because that module is `server-only` —
 * it holds the provider key — while the invoice email body is composed
 * by a pure renderer the composer also previews in the browser. One
 * implementation, importable from both sides; `send.ts` re-exports it
 * so its existing callers are unchanged.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
