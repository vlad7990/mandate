/**
 * The app's icon set — drawn SVG, not a webfont.
 *
 * The app renders icons as Material Symbols ligatures:
 *
 *     <span className="material-symbols-outlined">folder_open</span>
 *
 * That puts the literal string "folder_open" in the DOM as text. It is
 * `aria-hidden` in most places, but not all, and where it is not, a
 * screen reader reads the ligature name aloud in the middle of a label.
 * It also means every icon depends on a blocking webfont from Google —
 * before it loads, the raw words are visible on screen.
 *
 * These are inline instead: one stroke weight (1.8, matching the
 * comps), `currentColor`, and no text content to leak. Paths are taken
 * from the design comps rather than approximated.
 *
 * 425 ligature usages remain across the page-level components. Convert
 * them opportunistically; the shell is done.
 */

export type IconProps = {
  readonly size?: number;
  readonly className?: string;
};

function svg(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className,
  };
}

// ── Navigation ──────────────────────────────────────────────────────

export function IconPortfolio({ size = 16, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}

export function IconAnalytics({ size = 16, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M3 3v18h18" />
      <path d="M7 15l4-5 3 3 5-7" />
    </svg>
  );
}

export function IconMandates({ size = 16, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

export function IconCandidates({ size = 16, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 20c0-3.4 3.1-5.5 7-5.5s7 2.1 7 5.5" />
    </svg>
  );
}

export function IconNetwork({ size = 16, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <circle cx="12" cy="12" r="2.4" />
      <circle cx="5" cy="6" r="2" />
      <circle cx="19" cy="6" r="2" />
      <circle cx="5" cy="18" r="2" />
      <circle cx="19" cy="18" r="2" />
      <path d="M6.6 7.4 10 10.4M17.4 7.4 14 10.4M6.6 16.6 10 13.6M17.4 16.6 14 13.6" />
    </svg>
  );
}

export function IconIntelligence({ size = 16, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M12 3a4 4 0 0 0-4 4v1.2A4 4 0 0 0 6 12a4 4 0 0 0 2 3.5V17a4 4 0 0 0 8 0v-1.5A4 4 0 0 0 18 12a4 4 0 0 0-2-3.8V7a4 4 0 0 0-4-4z" />
    </svg>
  );
}

export function IconSkills({ size = 16, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M4 6h16M4 12h10M4 18h7" />
    </svg>
  );
}

export function IconSettings({ size = 16, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
    </svg>
  );
}

// ── Chrome ──────────────────────────────────────────────────────────

export function IconSearch({ size = 15, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}

export function IconBell({ size = 16, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
      <path d="M10.5 20a2 2 0 0 0 3 0" />
    </svg>
  );
}

export function IconChevronRight({ size = 14, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function IconChevronDown({ size = 16, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** Up-and-down chevrons — a menu that opens in either direction. */
export function IconSelector({ size = 16, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="m8 9 4-4 4 4M8 15l4 4 4-4" />
    </svg>
  );
}

export function IconMenu({ size = 20, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function IconClose({ size = 18, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function IconCopilot({ size = 17, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
      <rect x="7" y="7" width="10" height="10" rx="2.5" />
    </svg>
  );
}

export function IconInfo({ size = 13, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}

export function IconArrowRight({ size = 16, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M4 12h15" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export function IconPrint({ size = 15, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M7 8V3h10v5" />
      <path d="M7 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
      <path d="M7 14h10v7H7z" />
    </svg>
  );
}

export function IconSpark({ size = 15, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M12 3.2 13.7 9l5.8 1.7-5.8 1.7L12 18.2 10.3 12.4 4.5 10.7 10.3 9z" />
      <path d="M18.5 4v3M20 5.5h-3" />
    </svg>
  );
}

export function IconRefresh({ size = 15, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v6h-6" />
    </svg>
  );
}

export function IconCheck({ size = 14, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="m5 12.5 4.5 4.5L19 6.5" />
    </svg>
  );
}

export function IconFlag({ size = 14, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M5 21V4" />
      <path d="M5 4.5h11l-1.8 3.6L16 12H5z" />
    </svg>
  );
}
