// The merge discipline for #24's write — pure, and the reason the
// seam cannot suffer field creep.
//
// The database guard refuses the dnc family and the do_not_contact
// transitions outright; this module is the layer ABOVE it: whatever
// the model returned, the update object it builds contains ONLY the
// four fields the agent may maintain, the state is clamped to the
// writable vocabulary, and a suppressed profile keeps its state
// untouched (the guard would refuse the transition anyway — clamping
// here means the lawful rest of the merge still lands).

import type {
  RelationshipJudgment,
  RelationshipStateWritable,
} from "@/lib/ai/relationship";

const WRITABLE_STATES: RelationshipStateWritable[] = [
  "cold",
  "contacted",
  "engaged",
  "warm",
  "placed",
  "client_contact",
];

export type RelationshipUpdate = {
  disposition: Record<string, unknown>;
  relationship_state?: RelationshipStateWritable;
  follow_up_at: string | null;
  follow_up_note: string | null;
  last_meaningful_contact_at: string | null;
  updated_at: string;
};

export function buildRelationshipUpdate(args: {
  judgment: RelationshipJudgment;
  /** The profile is suppressed — its state is not the agent's to move. */
  profileDnc: boolean;
  /** Deterministic, from the contact history — not the model's. */
  lastMeaningfulContactAt: string | null;
  now: Date;
}): RelationshipUpdate {
  const { judgment, profileDnc, lastMeaningfulContactAt, now } = args;

  const update: RelationshipUpdate = {
    disposition: { ...judgment.disposition },
    follow_up_at: normaliseDate(judgment.follow_up_at),
    follow_up_note: trimOrNull(judgment.follow_up_note),
    last_meaningful_contact_at: lastMeaningfulContactAt,
    updated_at: now.toISOString(),
  };

  const state = judgment.relationship_state;
  if (!profileDnc && (WRITABLE_STATES as string[]).includes(state)) {
    update.relationship_state = state;
  }
  // A model that returned anything else — including 'do_not_contact',
  // which the schema does not offer — writes NO state at all.

  return update;
}

function normaliseDate(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function trimOrNull(value: string | null): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}
