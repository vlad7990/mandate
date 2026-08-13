import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { hasCapability } from "@/lib/auth/access";
import { type Capability } from "@/lib/auth/roles";

/**
 * The outer frame every dashboard page sits in.
 *
 * Five different maximum widths were in use — 1600, 1500, 1400, 6xl and
 * 5xl — with no rule behind which page got which, so moving between screens
 * shifted the left margin and the eye had to re-find the first column. There
 * are only two kinds of page here, and the measure follows from which:
 *
 * - `data` — lists, tables, dashboards. As wide as the screen allows,
 *   because a table with eight columns has nowhere else to go.
 * - `reading` — libraries, prose, forms. Capped near 70 characters, because
 *   a definition set in a 1600px line is not readable at any font size.
 */
export type ShellWidth = "data" | "reading";

const WIDTH: Record<ShellWidth, string> = {
  data: "max-w-[1600px]",
  reading: "max-w-[960px]",
};

export function PageShell({
  width = "data",
  className,
  children,
}: {
  width?: ShellWidth;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mx-auto px-6 py-6", WIDTH[width], className)}>
      {children}
    </div>
  );
}

/**
 * Page title, one line of context, and at most one primary action.
 *
 * The same header was hand-built on each screen with the type scale drifting
 * between them — 28px here, `text-2xl` there, an uppercase mono variant
 * elsewhere. One action only, by intent: a page with three equally-weighted
 * buttons has not decided what it is for.
 */
export async function PageHeader({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: {
    label: string;
    href: string;
    icon?: React.ReactNode;
    /**
     * Hide the action from roles that lack this. The header's action is
     * always a write — "New mandate", "New search" — so offering it to a
     * viewer produces a button whose only outcome is the no-access page.
     */
    capability?: Capability;
  };
  /** Secondary controls, rendered beside the action. */
  children?: React.ReactNode;
}) {
  const actionAllowed =
    !action?.capability || (await hasCapability(action.capability));
  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className="min-w-0 flex-1">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-on-surface">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 text-sm text-on-surface-variant">{subtitle}</p>
        )}
      </div>
      {children}
      {action && actionAllowed && (
        <Link
          href={action.href}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-primary bg-primary px-4 text-sm font-semibold text-on-primary transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {action.label}
          {action.icon}
        </Link>
      )}
    </div>
  );
}

/**
 * The bordered container a list lives in — toolbar, table and pagination
 * share one outline so they read as one object rather than three stacked
 * cards.
 */
export function ListPanel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low",
        className
      )}
    >
      {children}
    </div>
  );
}
