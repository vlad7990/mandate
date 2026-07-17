// Deterministic timestamp formatting for Executive Intelligence UI.
//
// toLocaleString() renders differently depending on the runtime's timezone and
// locale, so using it inside a client component produces a React hydration
// mismatch (server renders in the server's tz, client re-renders in the
// browser's). These helpers format from UTC components, so the output is
// identical on server and client for the same instant — no mismatch, no
// client-only flash.

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** e.g. "2026-07-17 17:36 UTC" — stable across server/client renders. */
export function formatTimestampUtc(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    ` ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
  );
}

/** e.g. "2026-07-17" — date only, UTC. */
export function formatDateUtc(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
