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
 *
 * ## The terminal voice
 *
 * The product ran two visual languages at once until 2026-08-13 — soft here,
 * terminal on Analytics, Network, Skills and Executive Intelligence — and the
 * terminal one won, because the marketing site and the OG card had already
 * committed to it and buyers were converting off that into a softer product.
 *
 * This header is the load-bearing piece of that. Only three screens use it
 * (Portfolio, Mandates, Candidates), which is exactly the set that was soft,
 * so changing it here re-voices all three without touching a screen that was
 * already right.
 *
 * The rules, which the rest of the re-skin follows:
 *
 * - Titles uppercase via CSS, never `.toUpperCase()`. Screen readers read the
 *   DOM text, so the announced name stays "Portfolio" while the eye gets
 *   `PORTFOLIO`. Transforming the string would put the shouting in the
 *   accessibility tree.
 * - Context lines are mono, uppercase, letter-spaced, `tabular-nums`, with
 *   `//` between clauses. `--text-mono-label` has `line-height: 1`, which is
 *   right for a chip and wrong for anything that wraps, so wrapping context
 *   sets its own leading.
 * - Nothing is rounded. Radius is what read as "soft"; removing it is most
 *   the work on every surface below.
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
  // Stacked below `sm`, side-by-side above it. `flex-wrap` alone was not
  // enough once titles became uppercase: an uppercase word is materially
  // wider than its sentence-case self, and `flex-1 min-w-0` lets the title
  // box shrink below the width of a single unbreakable word — so the word
  // overflowed its box and ran underneath the action button rather than
  // pushing it to the next line. Stacking removes the contest entirely.
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start">
      <div className="min-w-0 flex-1">
        <h1 className="font-h1 text-[26px] uppercase leading-tight tracking-tight text-on-surface sm:text-h1">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 font-mono-label text-mono-label uppercase leading-[1.5] tracking-widest text-on-surface-variant tabular-nums">
            {subtitle}
          </p>
        )}
      </div>
      {children}
      {action && actionAllowed && (
        <Link
          href={action.href}
          className={cn(PRIMARY_ACTION, "h-9 shrink-0")}
        >
          {action.label}
          {action.icon}
        </Link>
      )}
    </div>
  );
}

/**
 * The screaming-snake page title — `GLOBAL_EXECUTIVE_NETWORK`,
 * `COMPARATIVE_MARKET_REPORT`, and eight others.
 *
 * Ten pages had written this `h1` with byte-identical classes, and every one
 * of them overflowed on a phone: a 24-character token has no space to break
 * at, so it is a single unbreakable word ~490px wide in a 327px column, and
 * `min-w-0` cannot help because the box cannot go below one word.
 *
 * `<wbr>` after each underscore is the fix. It offers the browser a break
 * opportunity without putting anything in the text — no hyphen appears, and
 * on a wide screen it stays on one line exactly as before. `break-all` was
 * the alternative and is worse: it breaks mid-word at whatever column runs
 * out, so `GLOBAL_EXECUT / IVE_NETWORK`.
 *
 * **The accessible name is not the visible text.** The note above used to
 * claim the DOM text was fine "for screen readers". It is not: a reader
 * announces `GLOBAL_EXECUTIVE_NETWORK` as its literal characters, so the
 * page heading — the single most important landmark on the screen — arrives
 * as punctuation. The rest of the product uppercases in CSS and does not
 * have this problem; these twelve hardcode their capitals because the
 * underscores are the visual signature and CSS cannot insert them.
 *
 * So the glyphs stay and the name is supplied separately: the visible token
 * is hidden from assistive tech and `aria-label` carries the sentence. The
 * name is derived from the token by default, which means the twelve existing
 * call sites did not have to change and a thirteenth cannot forget. Pass
 * `label` where the derivation would be wrong — an acronym is the usual
 * reason, e.g. `AI_CANDIDATE_SEARCH`, which derives as "Ai candidate search".
 *
 * The size ramp matches `PageHeader` — 26px below `sm`, the 32px token above.
 */
export function TerminalTitle({
  children,
  label,
  className,
}: {
  children: string;
  /** Overrides the derived accessible name. Use for acronyms. */
  label?: string;
  className?: string;
}) {
  const segments = children.split("_");

  return (
    <h1
      aria-label={label ?? humanizeTerminalTitle(children)}
      className={cn(
        "font-h1 text-[26px] leading-tight tracking-tight text-on-surface sm:text-h1",
        className
      )}
    >
      <span aria-hidden="true">
        {segments.map((segment, i) => (
          <React.Fragment key={i}>
            {i > 0 && (
              <>
                {"_"}
                <wbr />
              </>
            )}
            {segment}
          </React.Fragment>
        ))}
      </span>
    </h1>
  );
}

/**
 * `PLACEMENTS_AND_FEES` → `Placements and fees`.
 *
 * Sentence case rather than title case: a screen reader is reading a
 * sentence to somebody, and Title Case On Every Word reads as emphasis it
 * has not earned.
 */
export function humanizeTerminalTitle(token: string): string {
  const words = token.split("_").filter(Boolean).map((w) => w.toLowerCase());
  if (words.length === 0) return token;
  return words[0].charAt(0).toUpperCase() + words[0].slice(1) +
    (words.length > 1 ? " " + words.slice(1).join(" ") : "");
}

/**
 * The one primary button shape, as a class string.
 *
 * A string rather than a component because most call sites are inside client
 * components carrying their own `onClick`, and a component would force every
 * one of them through the same props. `PANEL_BUTTON` in
 * `components/projects/panel.tsx` is the same shape at panel scale — they are
 * separate because the paddings differ, not the voice.
 */
export const PRIMARY_ACTION =
  "btn-notch inline-flex items-center gap-2 border border-primary-container bg-primary-container px-4 font-mono-label text-mono-label uppercase tracking-widest text-on-primary-container transition-[filter,transform] hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60";

/** The quiet counterpart — secondary navigation and cancel-shaped actions. */
export const QUIET_ACTION =
  "inline-flex items-center gap-2 border border-outline-variant px-4 font-mono-label text-mono-label uppercase tracking-widest text-on-surface-variant transition-colors hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60";

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
        "overflow-hidden border border-outline-variant bg-surface-container-low",
        className
      )}
    >
      {children}
    </div>
  );
}
