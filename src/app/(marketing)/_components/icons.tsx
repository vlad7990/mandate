/**
 * The marketing surface's icons, drawn rather than typed.
 *
 * The homepage used a `✓` character from the monospace face for pricing
 * ticks. A text glyph inherits the font's own weight and baseline, so it
 * sat a little low and a little light next to everything around it, and
 * a screen reader would read it aloud as "check mark" in the middle of
 * a feature name unless it was hidden. These are `aria-hidden` by
 * default and inherit `currentColor` and stroke weight from the label
 * they sit beside.
 *
 * One stroke width (1.75) and one linecap across the set, matching the
 * comps' 2.4-on-24 at the sizes actually used.
 */

type IconProps = {
  readonly size?: number;
  readonly className?: string;
};

function base(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className,
  };
}

/** Feature-list tick. */
export function CheckMark({ size = 15, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="m5 12.5 4.5 4.5L19 6.5" />
    </svg>
  );
}

/** Absent from this tier. Paired with a text label, never colour alone. */
export function DashMark({ size = 15, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M6 12h12" />
    </svg>
  );
}

/** Forward action on a CTA. */
export function ArrowRight({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M4 12h15" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

/** A locked step in the Executive Intelligence chain. */
export function LockMark({ size = 15, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="1.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
