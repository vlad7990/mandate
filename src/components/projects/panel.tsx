import Link from "next/link";

/**
 * The panel shell every section of the mandate workspace sits in — comp 08.
 *
 * It lives here rather than inside `project-view.tsx` because half the
 * page's sections are client components with their own state (the agent
 * panels), and a shared shell is the only thing that keeps a server-rendered
 * card and a client panel looking like the same product. No `"use client"`:
 * it is a plain component, so it renders in either context.
 *
 * Deliberately has no icon slot. The old panels put a Material Symbols
 * ligature beside every heading, which both shipped the literal string
 * "tips_and_updates" to the accessibility tree and made twelve stacked
 * sections read as twelve competing badges. The heading carries the section.
 */
export function Panel({
  title,
  meta,
  action,
  children,
  tone = "default",
}: {
  title: string;
  /** Status text or a chip. Sits next to the heading. */
  meta?: React.ReactNode;
  /** Right-aligned: a link, or a control the panel owns. */
  action?: React.ReactNode;
  children: React.ReactNode;
  /** `notice` marks a panel that is asking for attention, not just present. */
  tone?: "default" | "notice";
}) {
  return (
    <section
      className={`overflow-hidden rounded-xl border bg-surface-container-low ${
        tone === "notice" ? "border-tertiary/40" : "border-outline-variant"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-outline-variant px-[18px] py-[15px]">
        <h2 className="text-sm font-semibold text-on-surface">{title}</h2>
        {meta}
        {action && <div className="ml-auto flex items-center gap-2">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** Panel-header link, for sections whose action is "go somewhere". */
export function PanelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="text-xs font-medium text-primary hover:underline"
    >
      {children}
    </Link>
  );
}

/** Status text in a panel header — generated-at, counts, gate reasons. */
export function PanelMeta({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
      {children}
    </span>
  );
}

/**
 * The two button shapes a panel header uses. Exported as class strings rather
 * than components because the buttons carry `onClick` from inside client
 * components, and a shared component would force every consumer through the
 * same props.
 */
export const PANEL_BUTTON =
  "flex items-center gap-2 rounded-md bg-primary-container px-3 py-1.5 font-mono-label text-[11px] font-semibold uppercase tracking-[0.08em] text-on-primary-container transition-[filter,transform] hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export const PANEL_BUTTON_QUIET =
  "flex items-center gap-2 rounded-md border border-outline-variant px-3 py-1.5 font-mono-label text-[11px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/** Body padding, so panels do not drift apart on spacing. */
export const PANEL_BODY = "px-[18px] py-4";
