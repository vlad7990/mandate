/**
 * Merging two records of one person — the words, and the arithmetic behind
 * them.
 *
 * Gate: docs/superpowers/specs/2026-09-25-candidate-merge-gate.md
 * (CONFIRMED). The MECHANICS live in `merge_candidates` (migration 142),
 * one SECURITY DEFINER function in one transaction, because reparenting
 * eighteen tables across eighteen round trips leaves a half-merge nobody
 * can reconstruct.
 *
 * What lives HERE is everything a test can reach without a database: what
 * the recruiter is told is about to happen, and what they are told
 * happened. Both matter more than usual, because:
 *
 *  · D1 lets the merge DROP things — a score, an engagement lane, a
 *    prescreen — and a drop nobody was told about is §175's defect class
 *    with a button on it; and
 *  · there is no undo. A confirm that hides that is worse than no confirm.
 */

/** What one record carries, as the side-by-side needs to show it. */
export type RecordSummary = {
  id: string;
  fullName: string;
  stage: string | null;
  /** Null when the mandate has not ranked this person yet. */
  score: number | null;
  notes: number;
  /** Filename only — the bucket path is nobody's business on screen. */
  cvName: string | null;
  email: string | null;
  linkedinUrl: string | null;
  currentTitle: string | null;
  currentCompany: string | null;
  /** D3's hard gate. The server refuses; the screen should not offer. */
  hasPlacement: boolean;
  createdAt: string;
};

/**
 * The fields D4 fills, in the order the confirm lists them. Kept beside
 * the summary type so a new inherited field cannot be added in one place
 * and forgotten in the other.
 */
const INHERITABLE: Array<{ key: keyof RecordSummary; label: string }> = [
  { key: "email", label: "email address" },
  { key: "linkedinUrl", label: "LinkedIn profile" },
  { key: "currentTitle", label: "job title" },
  { key: "currentCompany", label: "company" },
];

function blank(value: unknown): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

/**
 * Everything the merge will do, as plain sentences, computed from what the
 * two records actually carry.
 *
 * Deliberately returns the GAINS and the LOSSES separately: a confirm that
 * mixes "6 notes move across" into the same list as "the score is dropped"
 * reads as noise, and the recruiter is being asked about the losses.
 */
export type MergePreview = {
  keeps: string[];
  loses: string[];
  /** True when the server will refuse. The screen should not offer it. */
  refused: boolean;
  refusal: string | null;
};

export function previewMerge(
  keep: RecordSummary,
  discard: RecordSummary
): MergePreview {
  if (discard.hasPlacement) {
    return {
      keeps: [],
      loses: [],
      refused: true,
      refusal: `${discard.fullName} carries a placement. Make that the record you keep, or remove the placement first — nothing has been changed.`,
    };
  }

  const keeps: string[] = [];
  const loses: string[] = [];

  if (discard.notes > 0) {
    keeps.push(
      `${discard.notes} ${discard.notes === 1 ? "note" : "notes"} move across and stay attributed to whoever wrote them`
    );
  }

  for (const field of INHERITABLE) {
    if (blank(keep[field.key]) && !blank(discard[field.key])) {
      keeps.push(`the ${field.label} from ${discard.fullName} fills a blank`);
    }
  }

  // D1 — only a genuine collision is a loss. If the survivor has no score,
  // the other record's score MOVES and nothing is lost.
  if (discard.score !== null && keep.score !== null) {
    loses.push(
      `its score of ${discard.score} — this record's ${keep.score} is the one kept`
    );
  }

  if (discard.cvName) {
    loses.push(`its CV, ${discard.cvName}, which is deleted with it`);
  }

  loses.push("the record itself, which cannot be brought back");

  return { keeps, loses, refused: false, refusal: null };
}

/**
 * The confirm text, verbatim. A test asserts these words because the
 * sentence IS the safeguard — this is the last thing standing between a
 * recruiter and an irreversible delete.
 */
export function describeConfirm(
  keep: RecordSummary,
  discard: RecordSummary,
  preview: MergePreview
): string {
  const lines = [
    `Keep "${keep.fullName}" and discard "${discard.fullName}"?`,
    "",
  ];
  if (preview.keeps.length > 0) {
    lines.push("Carried over:");
    for (const k of preview.keeps) lines.push(`  · ${k}`);
    lines.push("");
  }
  lines.push("Lost for good:");
  for (const l of preview.loses) lines.push(`  · ${l}`);
  lines.push("", "This cannot be undone.");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// The receipt
// ---------------------------------------------------------------------------

/** Exactly what `merge_candidates` returns. */
export type MergeReceipt = {
  kept_id: string;
  kept_label: string;
  discarded_label: string;
  discarded_cv: string | null;
  moved: Record<string, number>;
  dropped: Record<string, number>;
  filled: string[];
};

const MOVED_LABELS: Record<string, [string, string]> = {
  notes: ["note", "notes"],
  feedback: ["piece of feedback", "pieces of feedback"],
  outreach: ["outreach record", "outreach records"],
  verdicts: ["verdict", "verdicts"],
  trail_events: ["trail entry", "trail entries"],
  notifications: ["notification", "notifications"],
  score: ["score", "scores"],
  engagement: ["engagement lane", "engagement lanes"],
  prescreens: ["prescreen", "prescreens"],
  outreach_strategies: ["outreach strategy", "outreach strategies"],
  interview_plans: ["interview plan", "interview plans"],
};

const DROPPED_LABELS: Record<string, string> = {
  engagement: "engagement lane",
  prescreens: "prescreen",
  outreach_strategies: "outreach strategy",
  interview_plans: "interview plan",
  sent_notifications: "sent notification",
};

function plural(key: string, n: number): string {
  const pair = MOVED_LABELS[key];
  if (!pair) return `${n} ${key}`;
  return `${n} ${n === 1 ? pair[0] : pair[1]}`;
}

/**
 * One sentence saying what actually happened, built from the receipt the
 * database returned rather than from what the screen predicted. The
 * prediction was made before the merge ran; only this was there.
 */
export function describeReceipt(receipt: MergeReceipt): string {
  const parts: string[] = [
    `Merged "${receipt.discarded_label}" into "${receipt.kept_label}".`,
  ];

  const movedKeys = Object.keys(receipt.moved ?? {});
  if (movedKeys.length > 0) {
    parts.push(
      `Moved across: ${movedKeys
        .map((k) => plural(k, receipt.moved[k]))
        .join(", ")}.`
    );
  }

  const filled = receipt.filled ?? [];
  if (filled.length > 0) {
    parts.push(
      `Filled ${filled.length === 1 ? "a blank field" : "blank fields"}: ${filled
        .map((f) => f.replace(/_/g, " "))
        .join(", ")}.`
    );
  }

  // Stated last and never omitted when present: this is the half the
  // recruiter needs to notice.
  const droppedKeys = Object.keys(receipt.dropped ?? {});
  if (droppedKeys.length > 0) {
    parts.push(
      `Dropped: ${droppedKeys
        .map((k) =>
          k === "score"
            ? `the other record's score of ${receipt.dropped[k]}`
            : `${receipt.dropped[k]} ${DROPPED_LABELS[k] ?? k}`
        )
        .join(", ")}.`
    );
  }

  return parts.join(" ");
}
