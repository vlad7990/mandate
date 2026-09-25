/**
 * The words around merging two PEOPLE — and the one place that decides
 * what the screen promises before it happens.
 *
 * Gate: docs/superpowers/specs/2026-09-25-network-profile-merge-gate.md.
 * The mechanics are `merge_network_profiles` (migration 143); this is the
 * confirm and the receipt, which matter for the same reason they did in
 * §202: the act cannot be undone, and one of its effects is on somebody
 * who asked not to be contacted.
 */

export type MergeablePerson = {
  id: string;
  displayName: string;
  identityKey: string;
  relationshipState: string;
  dnc: boolean;
  dncReason: string | null;
  /** How many candidate records this person currently holds. */
  candidates: number;
};

const WARMTH: Record<string, number> = {
  cold: 0,
  contacted: 1,
  engaged: 2,
  warm: 3,
  placed: 4,
};

/** Mirrors `relationship_warmth` in 143. Non-temperatures rank -1. */
export function warmth(state: string): number {
  return WARMTH[state] ?? -1;
}

/**
 * What the merge will do, computed the same way the function does, so the
 * confirm cannot promise one thing and the database do another.
 */
export function previewPeopleMerge(
  keep: MergeablePerson,
  discard: MergeablePerson
): { carries: string[]; warnings: string[] } {
  const carries: string[] = [];
  const warnings: string[] = [];

  if (discard.candidates > 0) {
    carries.push(
      `${discard.candidates} candidate ${discard.candidates === 1 ? "record" : "records"} move across`
    );
  }
  carries.push(
    "the old identity key becomes an alias, so this stays merged — and a future CV under it rejoins"
  );

  // D2. Stated as a WARNING rather than a carry: raising suppression is
  // the consequence a recruiter most needs to see before agreeing.
  if (discard.dnc && !keep.dnc) {
    warnings.push(
      `${discard.displayName} is marked do-not-contact${
        discard.dncReason ? ` — "${discard.dncReason}"` : ""
      }. The merged person becomes do-not-contact too; a merge can never lift it.`
    );
  }

  if (warmth(discard.relationshipState) > warmth(keep.relationshipState)) {
    carries.push(
      `the warmer relationship is kept: ${discard.relationshipState}, not ${keep.relationshipState}`
    );
  }

  warnings.push("The other person's record is deleted. This cannot be undone.");
  return { carries, warnings };
}

export function describePeopleConfirm(
  keep: MergeablePerson,
  discard: MergeablePerson
): string {
  const { carries, warnings } = previewPeopleMerge(keep, discard);
  const lines = [
    `Keep "${keep.displayName}" and merge "${discard.displayName}" into them?`,
    "",
    "What carries over:",
    ...carries.map((c) => `  · ${c}`),
    "",
    "Be aware:",
    ...warnings.map((w) => `  · ${w}`),
  ];
  return lines.join("\n");
}

export type PeopleMergeReceipt = {
  kept_id: string;
  kept: string;
  merged_in: string;
  candidates: number;
  aliases_moved: number;
  state: string;
  dnc_carried: boolean;
  filled: string[];
};

/** One sentence from what the database actually did. */
export function describePeopleReceipt(r: PeopleMergeReceipt): string {
  const parts = [`Merged "${r.merged_in}" into "${r.kept}".`];
  if (r.candidates > 0) {
    parts.push(
      `${r.candidates} candidate ${r.candidates === 1 ? "record" : "records"} moved across.`
    );
  }
  if (r.aliases_moved > 0) {
    parts.push(
      `${r.aliases_moved} earlier ${r.aliases_moved === 1 ? "alias" : "aliases"} followed.`
    );
  }
  parts.push(`Relationship: ${r.state.replace(/_/g, " ")}.`);
  if ((r.filled ?? []).length > 0) {
    parts.push(`Filled: ${r.filled.map((f) => f.replace(/_/g, " ")).join(", ")}.`);
  }
  // Last and never omitted: the half with consequences outside the app.
  if (r.dnc_carried) {
    parts.push("Do-not-contact carried across and now covers both records.");
  }
  return parts.join(" ");
}
