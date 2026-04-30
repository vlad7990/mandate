import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// Terminal-style breadcrumb rail: small caps, mono-label, slash-separated
// segments. The last segment is the current location and renders as
// primary; preceding segments render as muted hyperlinks. Matches the
// header chrome on every project subpage so the user always knows where
// they are without guessing.

export type CrumbSegment = {
  label: string;
  href?: string;
  /** Truncate long labels (default 32ch). */
  maxChars?: number;
};

export function BreadcrumbRail({
  segments,
  className,
}: {
  segments: CrumbSegment[];
  className?: string;
}) {
  if (segments.length === 0) return null;
  const last = segments.length - 1;
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "flex items-center gap-2 font-mono-label text-mono-label uppercase tracking-widest text-outline flex-wrap",
        className
      )}
    >
      {segments.map((seg, i) => {
        const isLast = i === last;
        const truncated =
          seg.maxChars && seg.label.length > seg.maxChars
            ? `${seg.label.slice(0, seg.maxChars - 1)}…`
            : seg.label;
        const node = isLast ? (
          <span className="text-primary">{truncated}</span>
        ) : seg.href ? (
          <Link
            href={seg.href}
            prefetch={false}
            className="hover:text-on-surface transition-colors focus-visible:outline-none focus-visible:text-primary focus-visible:underline focus-visible:underline-offset-2"
          >
            {truncated}
          </Link>
        ) : (
          <span className="text-on-surface-variant">{truncated}</span>
        );
        return (
          <React.Fragment key={`${seg.label}-${i}`}>
            {node}
            {!isLast && (
              <span className="text-outline-variant" aria-hidden>
                /
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
