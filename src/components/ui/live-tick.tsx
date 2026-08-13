import * as React from "react";
import { cn } from "@/lib/utils";

// Trading-floor "AS OF HH:MM" stamp with an optional pulsing dot. Render
// it next to a header to anchor the data in time and signal "this is a
// live surface, not a static doc". Uses tabular-nums so the timestamp
// width never shifts as time advances on re-renders.
//
// Consumed in server-rendered headers, so timestamp formatting happens
// at render time on the server. Use the `iso` prop when the moment of
// truth is known (e.g. last-updated_at from the DB); use `nowOnServer`
// when the page render itself is the moment.

export function LiveTick({
  iso,
  nowOnServer = false,
  label = "AS OF",
  pulse = true,
  className,
}: {
  iso?: string | null;
  nowOnServer?: boolean;
  label?: string;
  pulse?: boolean;
  className?: string;
}) {
  const stamp = formatStamp(iso, nowOnServer);
  if (!stamp) return null;
  return (
    <span
      className={cn(
        "font-mono-label text-mono-label text-outline uppercase tracking-wider tabular-nums flex items-center gap-2 shrink-0",
        className
      )}
    >
      {pulse && (
        <span
          className="w-1.5 h-1.5 bg-secondary-fixed-dim animate-pulse"
          aria-hidden
        />
      )}
      <span>
        {label} {stamp}
      </span>
    </span>
  );
}

function formatStamp(iso: string | null | undefined, nowOnServer: boolean): string | null {
  const date = iso ? new Date(iso) : nowOnServer ? new Date() : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  // 24-hour HH:MM in the server locale; we keep it deliberately
  // locale-agnostic to read like instrumentation rather than calendar UI.
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm} UTC`;
}
