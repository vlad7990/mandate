"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { IconAlert, IconIntelligence, IconRefresh } from "@/components/icons";
import type {
  RelationshipProfile,
  SuppressionRecord,
} from "@/lib/network/profile-resolver";
import {
  clearDncAction,
  liftSuppressionAction,
  setDncAction,
  suppressionReachAction,
  updateRelationshipAction,
  type ReachedPerson,
} from "./relationship-actions";
import { unwrap } from "@/lib/actions/result";

/** §208 D3 — which act put a reason here, in the reader's words. */
const SOURCE_LABEL: Record<SuppressionRecord["source"], string> = {
  recruiter: "A recruiter decided",
  withdrawal: "They withdrew via their portal",
  erasure: "They requested erasure via their portal",
  carried: "Carried from another person",
};

/**
 * A lift the founder has been shown but not yet confirmed. `ids` is what
 * would be lifted; `reached` is who it touches, by name.
 */
type PendingLift = {
  label: string;
  ids: string[];
  reason: string;
  reached: ReachedPerson[];
  /** Clearing the person lifts every reason standing against them. */
  isWholePerson: boolean;
};

/**
 * The durable relationship overlay on a network person (#24, 098).
 * The agent maintains the record; the humans own every consequential
 * act: suppression (with a mandatory reason), and — founder only —
 * the un-suppression.
 *
 * §208 — suppression is a LEDGER, so this card no longer shows one reason.
 * It lists every unlifted reason with its source (D3), and no lift happens
 * until the founder has seen who else it reaches, named (D2).
 */
export function RelationshipCard({
  profile,
  suppressions = [],
  isFounder,
}: {
  profile: RelationshipProfile | null;
  /**
   * Every UNLIFTED reason standing against this person, earliest first — so
   * `suppressions[0]` is the row the badge's reason was derived from.
   */
  suppressions?: SuppressionRecord[];
  isFounder: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [act, setAct] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [lift, setLift] = useState<PendingLift | null>(null);

  if (!profile) {
    return (
      <div className="border-t border-outline-variant px-4 py-3">
        <p className="font-mono-data text-body-main text-on-surface-variant">
          No durable relationship record yet — it is created the next time
          this person&rsquo;s candidate record is touched.
        </p>
      </div>
    );
  }

  const run = (
    label: string,
    action: () => Promise<unknown>,
    successMessage: string
  ) => {
    if (pending) return;
    setAct(label);
    start(async () => {
      try {
        await action();
        toast.success(successMessage);
        setReason("");
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "The act did not land."
        );
      } finally {
        setAct(null);
      }
    });
  };

  /**
   * D2 — step one of every lift: ask who it reaches and show them. Nothing is
   * written here. The founder confirms against the names, or cancels.
   */
  const review = (
    label: string,
    ids: string[],
    isWholePerson: boolean
  ) => {
    if (pending) return;
    const words = reason.trim();
    if (words.length === 0 || ids.length === 0) return;
    setAct(label);
    start(async () => {
      try {
        const reached = unwrap(await suppressionReachAction(ids));
        setLift({ label, ids, reason: words, reached, isWholePerson });
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : "Who this lift reaches could not be read — nothing was lifted."
        );
      } finally {
        setAct(null);
      }
    });
  };

  /** Step two: the act itself, against exactly what was shown. */
  const confirmLift = () => {
    if (!lift) return;
    const { ids, reason: words, isWholePerson } = lift;
    run(
      "confirm",
      async () => {
        if (isWholePerson) {
          unwrap(await clearDncAction(profile.id, words));
          return;
        }
        for (const id of ids) {
          unwrap(await liftSuppressionAction(id, words));
        }
      },
      isWholePerson
        ? "Suppression cleared"
        : "That reason was lifted — any other reason still stands"
    );
    setLift(null);
  };

  const d = profile.disposition ?? {};
  const dispositionLines: Array<[string, string]> = (
    [
      ["Summary", d.summary],
      ["Timing", d.timing],
      ["Motivation", d.motivation],
      ["Location", d.location_constraints],
      ["Compensation", d.compensation_context],
      ["Notice", d.notice_period],
    ] as Array<[string, unknown]>
  ).filter((x): x is [string, string] => typeof x[1] === "string" && x[1].length > 0);
  const openQuestions = Array.isArray(d.open_questions)
    ? (d.open_questions as string[])
    : [];

  return (
    <div className="border-t border-outline-variant px-4 py-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap font-mono-label text-mono-label uppercase tracking-widest">
        <span className="text-on-surface-variant">Relationship</span>
        <span
          className={cn(
            "px-1.5 py-0 border",
            profile.dnc
              ? "border-error/60 text-error"
              : profile.relationship_state === "cold"
                ? "border-outline-variant text-on-surface-variant"
                : "border-secondary-fixed-dim/50 text-secondary-fixed-dim"
          )}
        >
          {profile.relationship_state.replace(/_/g, " ")}
        </span>
        {profile.last_meaningful_contact_at && (
          <span className="text-outline tabular-nums">
            Last contact {profile.last_meaningful_contact_at.slice(0, 10)}
          </span>
        )}
        {profile.follow_up_at && (
          <span className="text-tertiary tabular-nums">
            Follow up {profile.follow_up_at}
          </span>
        )}
      </div>

      {profile.dnc && (
        <div className="border border-error/50 bg-error/10 px-3 py-2 text-error space-y-2">
          <div className="flex items-start gap-2">
            <IconAlert size={14} className="mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              <p className="font-mono-label text-mono-label uppercase tracking-widest">
                Do not contact
                {suppressions.length > 1 &&
                  ` · ${suppressions.length} reasons stand`}
              </p>
              {/* No ledger loaded for this surface — say what the derived
                  columns say and nothing more. Rendering "no reasons" over an
                  unread ledger would be §175's class: asserting what we do
                  not know. */}
              {suppressions.length === 0 ? (
                <p className="font-mono-data text-body-main leading-snug">
                  {profile.dnc_reason ?? "No reason recorded."}
                  {profile.dnc_set_by === null && " Set by the system."}
                  {" Only a founder-level act with a recorded reason can clear this."}
                </p>
              ) : (
                <p className="font-mono-data text-body-main leading-snug">
                  {suppressions.length > 1
                    ? "Each is its own record. Lifting one leaves this person suppressed while any other stands."
                    : "Only a founder-level act with a recorded reason can lift this."}
                </p>
              )}
            </div>
          </div>

          {/* D3 — every unlifted reason, with its source. The first governs
              the badge above: it is the first time they said it. */}
          {suppressions.length > 0 && (
            <ol className="space-y-1.5">
              {suppressions.map((s, i) => (
                <li
                  key={s.id}
                  className="border-l-2 border-error/50 pl-2.5 space-y-0.5"
                >
                  <p className="font-mono-data text-body-main leading-snug">
                    {s.reason}
                  </p>
                  <p className="font-mono-label text-mono-label uppercase tracking-widest text-error/70 flex flex-wrap gap-x-2">
                    <span>{SOURCE_LABEL[s.source]}</span>
                    <span className="tabular-nums">{s.set_at.slice(0, 10)}</span>
                    <span>
                      {s.set_by === null
                        ? "set by the system"
                        : s.set_by_name
                          ? `set by ${s.set_by_name}`
                          : "set by a member of your team"}
                    </span>
                    {i === 0 && <span>· governs the badge</span>}
                  </p>
                  {/* §209 D2/D3 — a reason that arrived with somebody else.
                      Only ever rendered from a stamped move; when the moved-
                      off person's name could not be read it says the move
                      without naming them, rather than inventing a name. */}
                  {s.moved_at && (
                    <p className="font-mono-label text-mono-label uppercase tracking-widest text-error/70">
                      {s.moved_from_label
                        ? `Came across when ${s.moved_from_label} was merged in`
                        : "Came across from a person merged in"}
                      <span className="tabular-nums">
                        {" · "}
                        {s.moved_at.slice(0, 10)}
                      </span>
                    </p>
                  )}
                  {isFounder && (
                    <button
                      type="button"
                      onClick={() => review(`lift:${s.id}`, [s.id], false)}
                      disabled={pending || reason.trim().length === 0}
                      className="font-mono-label text-mono-label uppercase tracking-widest underline decoration-dotted underline-offset-2 hover:no-underline disabled:opacity-50"
                    >
                      {pending && act === `lift:${s.id}`
                        ? "Reading who this reaches…"
                        : "Lift this reason"}
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* D2 — a lift is NEVER SILENT. Who it reaches, by name, before it
          happens. Nothing has been written at this point. */}
      {lift && (
        <div className="border border-tertiary/60 bg-tertiary/10 px-3 py-2 space-y-2">
          <p className="font-mono-label text-mono-label uppercase tracking-widest text-tertiary">
            Confirm the lift
          </p>
          <p className="font-mono-data text-body-main text-on-surface leading-snug">
            {lift.reached.length === 1
              ? "This lifts one person. Nobody else holds a copy of it."
              : `This also lifts ${lift.reached.length - 1} other ${
                  lift.reached.length === 2 ? "person" : "people"
                } — the suppression was carried to them, and lifting it here lifts it there too.`}
          </p>
          <ul className="space-y-0.5">
            {lift.reached.map((r) => (
              <li
                key={r.suppressionId}
                className="font-mono-data text-body-main text-on-surface-variant leading-snug"
              >
                · {r.displayName}
                {!r.isOrigin && " — carried copy"}
              </li>
            ))}
          </ul>
          <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
            Recorded reason · {lift.reason}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={confirmLift}
              disabled={pending}
              className="px-3 py-1.5 border border-error/50 text-error font-mono-label text-mono-label uppercase tracking-widest hover:bg-error/10 transition-colors disabled:opacity-60"
            >
              {pending && act === "confirm" ? (
                <IconRefresh size={14} className="animate-spin" />
              ) : lift.isWholePerson ? (
                "Clear every reason"
              ) : (
                "Lift it"
              )}
            </button>
            <button
              type="button"
              onClick={() => setLift(null)}
              disabled={pending}
              className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:bg-surface-container-high transition-colors disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {dispositionLines.length > 0 && (
        <dl className="space-y-1">
          {dispositionLines.map(([label, value]) => (
            <div key={label} className="flex gap-2 items-baseline">
              <dt className="font-mono-label text-mono-label text-outline uppercase tracking-widest w-28 shrink-0">
                {label}
              </dt>
              <dd className="font-mono-data text-body-main text-on-surface-variant leading-snug">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {openQuestions.length > 0 && (
        <div className="space-y-1">
          <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
            Open questions
          </p>
          <ul className="space-y-0.5">
            {openQuestions.map((q, i) => (
              <li
                key={i}
                className="font-mono-data text-body-main text-on-surface-variant leading-snug"
              >
                · {q}
              </li>
            ))}
          </ul>
        </div>
      )}
      {profile.follow_up_note && (
        <p className="font-mono-data text-body-main text-on-surface-variant leading-snug border-l-2 border-tertiary/50 pl-3">
          {profile.follow_up_note}
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() =>
            run(
              "update",
              async () => unwrap(await updateRelationshipAction(profile.id)),
              "Relationship record updated"
            )
          }
          disabled={pending}
          className="px-3 py-1.5 btn-notch bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-1.5 disabled:opacity-60"
        >
          {pending && act === "update" ? (
            <IconRefresh size={14} className="animate-spin" />
          ) : (
            <IconIntelligence size={14} />
          )}
          Update relationship
        </button>

        {!profile.dnc && (
          <span className="flex items-center gap-2">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={pending}
              placeholder="Reason (required to suppress)"
              className="px-2 py-1.5 bg-surface-container-lowest border border-outline-variant font-mono-data text-body-main text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:border-primary w-56"
            />
            <button
              type="button"
              onClick={() =>
                run(
                  "dnc",
                  async () =>
                    unwrap(await setDncAction(profile.id, reason)),
                  "Marked do-not-contact"
                )
              }
              disabled={pending || reason.trim().length === 0}
              className="px-3 py-1.5 border border-error/50 text-error font-mono-label text-mono-label uppercase tracking-widest hover:bg-error/10 transition-colors disabled:opacity-60"
            >
              Do not contact
            </button>
          </span>
        )}

        {profile.dnc && isFounder && (
          <span className="flex items-center gap-2 flex-wrap">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={pending}
              placeholder="Reason (required to lift or clear)"
              className="px-2 py-1.5 bg-surface-container-lowest border border-outline-variant font-mono-data text-body-main text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:border-primary w-56"
            />
            {suppressions.length > 0 ? (
              <button
                type="button"
                onClick={() =>
                  review(
                    "clear",
                    suppressions.map((s) => s.id),
                    true
                  )
                }
                disabled={pending || reason.trim().length === 0}
                className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:bg-surface-container-high transition-colors disabled:opacity-60"
              >
                {pending && act === "clear"
                  ? "Reading who this reaches…"
                  : suppressions.length > 1
                    ? "Clear every reason"
                    : "Clear suppression"}
              </button>
            ) : (
              // dnc is DERIVED from the ledger, so a suppressed person with no
              // ledger rows on screen means the rows were not read — not that
              // there are none. A lift is never silent, and this is the one
              // state where who it reaches cannot be named.
              <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
                Its reasons could not be read — who a lift reaches cannot be
                shown, so nothing can be lifted here
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
