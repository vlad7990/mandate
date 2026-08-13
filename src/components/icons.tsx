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
 * The sweep is finished: no Material Symbols ligature, webfont <link>
 * or `.material-symbols-outlined` rule survives anywhere in the app.
 * Add icons here rather than reaching for a font.
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

export function IconCopy({ size = 14, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

export function IconMail({ size = 14, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 6.5 8.5 6 8.5-6" />
    </svg>
  );
}

export function IconPlus({ size = 14, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconPencil({ size = 13, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M4 20h4l10-10a2.1 2.1 0 0 0-3-3L5 17z" />
      <path d="m14.5 6.5 3 3" />
    </svg>
  );
}

export function IconDownload({ size = 14, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M12 4v11" />
      <path d="m7.5 11 4.5 4.5 4.5-4.5" />
      <path d="M5 20h14" />
    </svg>
  );
}

export function IconAtSign({ size = 16, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 5 2.2A9 9 0 1 0 17.5 20" />
    </svg>
  );
}

export function IconLock({ size = 16, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
    </svg>
  );
}

export function IconShield({ size = 16, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M12 3 5 6v5.5c0 4.2 2.9 7.6 7 9.5 4.1-1.9 7-5.3 7-9.5V6z" />
    </svg>
  );
}

export function IconArrowLeft({ size = 14, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M20 12H5" />
      <path d="m11 6-6 6 6 6" />
    </svg>
  );
}

/** Terminal failure. Deliberately a triangle, so it never reads as IconInfo. */
export function IconAlert({ size = 16, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M12 3.8 21.2 19.6H2.8z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  );
}

/** Rosette-and-check — the "approved / final" mark. */
export function IconVerified({ size = 14, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="m12 2.8 2.1 2 2.9-.3.3 2.9 2 2.1-2 2.1-.3 2.9-2.9-.3-2.1 2-2.1-2-2.9.3-.3-2.9-2-2.1 2-2.1.3-2.9 2.9.3z" />
      <path d="m9.2 9.6 2.2 2.2 3.6-4" />
    </svg>
  );
}

/** Two overlapping sheets — a diff between two versions. */
export function IconDiff({ size = 14, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M8 3h12a1 1 0 0 1 1 1v12" />
      <rect x="3" y="8" width="13" height="13" rx="1" />
    </svg>
  );
}

export function IconBuilding({ size = 14, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M3 21h18" />
      <path d="M4 21V10h7" />
      <path d="M11 21V4h9v17" />
      <path d="M14.5 8h1.5M14.5 12h1.5M14.5 16h1.5M7 14h1M7 17.5h1" />
    </svg>
  );
}

export function IconHistory({ size = 14, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M4 12a8 8 0 1 0 2.4-5.7L3 9.5" />
      <path d="M3 4.5V10h5.5" />
      <path d="M12 8v4.3l3 1.8" />
    </svg>
  );
}

export function IconSave({ size = 14, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <path d="M8 3v5h6" />
      <path d="M8 21v-6h8v6" />
    </svg>
  );
}

/** A node on a line — one committed version in a chain. */
export function IconCommit({ size = 14, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M3 12h5.8M15.2 12H21" />
    </svg>
  );
}

// ── Movement ────────────────────────────────────────────────────────
// These four carry information the label beside them does not, so they
// survive where the decorative ligatures were deleted.

/** Ticked lines — an interview plan, as against IconSkills' plain list. */
export function IconChecklist({ size = 15, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="m3 6.5 2 2 3.5-3.5" />
      <path d="m3 16.5 2 2 3.5-3.5" />
      <path d="M12 7h9M12 17h9" />
    </svg>
  );
}

/** A document that has been checked — an assessment. */
export function IconFactCheck({ size = 15, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M13 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9z" />
      <path d="M13 3v6h6" />
      <path d="m8.5 15.5 2 2 4-4.5" />
    </svg>
  );
}

export function IconUserPlus({ size = 15, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <circle cx="10" cy="8" r="3.2" />
      <path d="M3.5 20c0-3.3 2.9-5.3 6.5-5.3 1 0 2 .16 2.9.46" />
      <path d="M18 14v6M15 17h6" />
    </svg>
  );
}

export function IconUserMinus({ size = 15, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <circle cx="10" cy="8" r="3.2" />
      <path d="M3.5 20c0-3.3 2.9-5.3 6.5-5.3 1 0 2 .16 2.9.46" />
      <path d="M15 17h6" />
    </svg>
  );
}

/** Scales — the decision-support disclaimer's glyph. Weighing, not judging. */
export function IconBalance({ size = 16, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M12 4v16M7 20h10" />
      <path d="M4 8h16" />
      <path d="M4 8 1.8 13.5a2.6 2.6 0 0 0 4.4 0z" />
      <path d="M20 8l2.2 5.5a2.6 2.6 0 0 1-4.4 0z" />
    </svg>
  );
}

export function IconFilter({ size = 14, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M3.5 5h17l-6.6 7.6V19l-3.8 2v-8.4z" />
    </svg>
  );
}

export function IconClock({ size = 14, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5.3l3.4 2" />
    </svg>
  );
}

export function IconCode({ size = 14, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="m8 8-4.5 4L8 16" />
      <path d="m16 8 4.5 4L16 16" />
      <path d="m13.5 5-3 14" />
    </svg>
  );
}

export function IconPause({ size = 14, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M9.5 5v14M14.5 5v14" />
    </svg>
  );
}

export function IconPlay({ size = 14, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M7.5 4.8 19 12 7.5 19.2z" />
    </svg>
  );
}

export function IconTrash({ size = 14, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M4 6.5h16" />
      <path d="M9 6.5V4h6v2.5" />
      <path d="M6 6.5 6.9 20a1 1 0 0 0 1 1h8.2a1 1 0 0 0 1-1L18 6.5" />
      <path d="M10 11v5.5M14 11v5.5" />
    </svg>
  );
}

/** Crosshair — what a search is aimed at. */
export function IconTarget({ size = 14, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 12h.01" />
    </svg>
  );
}

/** A plain dash — no movement. Pairs with IconArrowUp / IconArrowDown. */
export function IconMinus({ size = 14, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M6 12h12" />
    </svg>
  );
}

/** Vertical swap — a reordering, as against IconCompare's horizontal one. */
export function IconSwapVert({ size = 14, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M8 20V5" />
      <path d="m4 9 4-4 4 4" />
      <path d="M16 4v15" />
      <path d="m12 15 4 4 4-4" />
    </svg>
  );
}

export function IconUpload({ size = 16, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M12 16V5" />
      <path d="m7.5 9.5 4.5-4.5 4.5 4.5" />
      <path d="M5 20h14" />
    </svg>
  );
}

export function IconCircle({ size = 16, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <circle cx="12" cy="12" r="8.5" />
    </svg>
  );
}

export function IconCheckCircle({ size = 16, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.2 12.2 2.6 2.6 5-5.6" />
    </svg>
  );
}

/** Sliders — adjusting weights, not the gear of IconSettings. */
export function IconTune({ size = 14, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M4 7h8M17 7h3" />
      <circle cx="14.5" cy="7" r="2.5" />
      <path d="M4 17h3M12 17h8" />
      <circle cx="9.5" cy="17" r="2.5" />
    </svg>
  );
}

export function IconShare({ size = 14, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <circle cx="18" cy="5" r="2.6" />
      <circle cx="6" cy="12" r="2.6" />
      <circle cx="18" cy="19" r="2.6" />
      <path d="m8.3 10.7 7.4-4.3M8.3 13.3l7.4 4.3" />
    </svg>
  );
}

export function IconLink({ size = 14, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M9.5 14.5a4.5 4.5 0 0 0 6.4 0l2.6-2.6a4.5 4.5 0 0 0-6.4-6.4l-1.4 1.4" />
      <path d="M14.5 9.5a4.5 4.5 0 0 0-6.4 0l-2.6 2.6a4.5 4.5 0 0 0 6.4 6.4l1.4-1.4" />
    </svg>
  );
}

/** Ranked bars — a leaderboard, as against IconAnalytics' trend line. */
export function IconLeaderboard({ size = 16, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M3 21h18" />
      <rect x="4" y="12" width="4.5" height="6" />
      <rect x="9.8" y="6" width="4.5" height="12" />
      <rect x="15.5" y="9" width="4.5" height="9" />
    </svg>
  );
}

export function IconGlobe({ size = 14, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3.3 9.5h17.4M3.3 14.5h17.4" />
      <path d="M12 3c-2.4 2.4-3.6 5.4-3.6 9s1.2 6.6 3.6 9c2.4-2.4 3.6-5.4 3.6-9s-1.2-6.6-3.6-9z" />
    </svg>
  );
}

export function IconTrendUp({ size = 12, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </svg>
  );
}

export function IconTrendDown({ size = 12, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="m3 7 6 6 4-4 8 8" />
      <path d="M15 17h6v-6" />
    </svg>
  );
}

export function IconTrendFlat({ size = 12, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M3 12h14" />
      <path d="m16 8 4 4-4 4" />
    </svg>
  );
}

/** Two opposing arrows — one thing measured against another. */
export function IconCompare({ size = 14, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M3 9h18" />
      <path d="m17 5 4 4-4 4" />
      <path d="M21 17H3" />
      <path d="m7 13-4 4 4 4" />
    </svg>
  );
}

export function IconArrowUp({ size = 14, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M12 19V5" />
      <path d="m6 11 6-6 6 6" />
    </svg>
  );
}

export function IconArrowDown({ size = 14, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M12 5v14" />
      <path d="m6 13 6 6 6-6" />
    </svg>
  );
}

export function IconSend({ size = 14, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M21 3 10.5 13.5" />
      <path d="M21 3 14.5 21l-4-7.5L3 9.5z" />
    </svg>
  );
}

export function IconFingerprint({ size = 16, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M4 9.4A9 9 0 0 1 19.4 7.8" />
      <path d="M6.5 12a5.5 5.5 0 0 1 11 0v2.5a13 13 0 0 1-.5 3.4" />
      <path d="M9.3 12a2.7 2.7 0 0 1 5.4 0v2.6a10 10 0 0 1-.7 3.5" />
      <path d="M12 10.6a1.4 1.4 0 0 1 1.4 1.4v3" />
      <path d="M9.4 19.4A12 12 0 0 0 10 15.2V12" />
    </svg>
  );
}

/** Circle-and-slash — an exclusion, not a failure. */
export function IconBlock({ size = 16, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

/** Two figures — a panel or group, as against IconCandidates' single one. */
export function IconGroup({ size = 16, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3 19.5c0-3 2.7-4.8 6-4.8s6 1.8 6 4.8" />
      <path d="M16 5.8a3 3 0 0 1 0 5.5" />
      <path d="M17.6 14.8c2 .7 3.4 2.2 3.4 4.4" />
    </svg>
  );
}

export function IconDocument({ size = 14, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M13 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9z" />
      <path d="M13 3v6h6" />
      <path d="M8.5 13.5h7M8.5 17h5" />
    </svg>
  );
}

/**
 * Placements and fees. A banknote rather than a currency glyph — a "$"
 * would be wrong the moment an org sets its base currency to anything
 * else, and the rail must not assert a currency the product does not know.
 */
export function IconPlacements({ size = 16, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <rect x="2.5" y="6" width="19" height="12" rx="1" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9.5v5M18 9.5v5" />
    </svg>
  );
}

/**
 * The activity trail. A clock with a back-arrow — the trail is a record of
 * what already happened, not a live feed, and the history metaphor says
 * that better than a list glyph would.
 */
export function IconActivity({ size = 16, className }: IconProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3 8.8" />
      <path d="M3 4.5V9h4.5" />
      <path d="M12 7.5V12l3 1.8" />
    </svg>
  );
}
