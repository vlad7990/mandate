"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { unwrap } from "@/lib/actions/result";
import { mergePeopleAction } from "./merge-people-actions";
import {
  describePeopleConfirm,
  type MergeablePerson,
} from "@/lib/network/merge-people";

/**
 * Folding two people in the network into one.
 *
 * ## Why this is two named choices and not a table of checkboxes
 *
 * The merge deletes one of the two records and can RAISE do-not-contact.
 * Choosing "keep" and "merge in" separately, by name, is the affordance
 * that makes which-is-which unmissable — and §201's rule applies here too:
 * the product never guesses which of two people matters more.
 *
 * `canMerge` is REQUIRED, not optional-with-a-default (§199): a
 * `CapabilityGate` cannot reach inside a client component, so the page
 * reads the capability once and tsc refuses any render site that forgets.
 */
export function MergePeoplePanel({
  people,
  canMerge,
}: {
  people: MergeablePerson[];
  canMerge: boolean;
}) {
  const router = useRouter();
  const [keepId, setKeepId] = useState("");
  const [discardId, setDiscardId] = useState("");
  const [running, setRunning] = useState(false);

  const keep = people.find((p) => p.id === keepId) ?? null;
  const discard = people.find((p) => p.id === discardId) ?? null;
  const ready = Boolean(keep && discard && keep.id !== discard.id) && !running;

  if (people.length < 2) {
    // Nothing to merge is not an error, and an empty pair of dropdowns
    // would read as broken rather than as inapplicable.
    return null;
  }

  async function run() {
    if (!keep || !discard) return;
    if (!window.confirm(describePeopleConfirm(keep, discard))) return;
    setRunning(true);
    try {
      const { message } = unwrap(await mergePeopleAction(keep.id, discard.id));
      toast.success(message, { duration: 15_000 });
      setKeepId("");
      setDiscardId("");
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "The merge did not happen."
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="mt-6 border border-outline-variant bg-surface-container-lowest p-4">
      <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
        Same person, two records
      </h2>
      <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-on-surface-variant">
        One person shows up twice when their records carry different
        identifiers — a CV with no email address keys on name and employer, a
        later one keys on the address itself. Folding them together moves the
        candidate records across, keeps the warmer relationship, and records
        the old identifier so the join survives and a future CV under it
        rejoins this person.
      </p>

      {!canMerge ? (
        <p className="mt-3 font-mono-label text-mono-label uppercase tracking-widest text-outline">
          Read-only · folding two people together is a recruiter&apos;s act
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <PersonPicker
              id="merge-keep"
              label="Keep this person"
              value={keepId}
              people={people}
              exclude={discardId}
              disabled={running}
              onChange={setKeepId}
            />
            <PersonPicker
              id="merge-discard"
              label="Merge this one in (their record is deleted)"
              value={discardId}
              people={people}
              exclude={keepId}
              disabled={running}
              onChange={setDiscardId}
            />
          </div>

          {keep && discard && keep.id !== discard.id && (
            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
              <Facts person={keep} heading="Kept" />
              <Facts person={discard} heading="Merged in, then deleted" />
            </dl>
          )}

          <button
            type="button"
            onClick={run}
            disabled={!ready}
            className="btn-notch mt-4 bg-primary-container px-4 py-2 font-mono-label text-[11px] font-semibold uppercase tracking-[0.1em] text-on-primary-container transition-[filter,transform] hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running ? "Merging…" : "Merge these two"}
          </button>
        </>
      )}
    </section>
  );
}

function PersonPicker({
  id,
  label,
  value,
  people,
  exclude,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  people: MergeablePerson[];
  exclude: string;
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label
        htmlFor={id}
        className="block font-mono-label text-mono-label uppercase tracking-widest text-outline"
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-outline-variant bg-surface-container-low px-3 py-2 text-body-main text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
      >
        <option value="">— choose a person —</option>
        {people
          // The same person cannot be both sides; the function refuses it
          // too, but offering it would be offering a refusal.
          .filter((p) => p.id !== exclude)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName}
              {p.dnc ? " · DO NOT CONTACT" : ""}
              {` · ${p.candidates} record${p.candidates === 1 ? "" : "s"}`}
              {` · ${p.identityKey.split(":")[0]}`}
            </option>
          ))}
      </select>
    </div>
  );
}

function Facts({
  person,
  heading,
}: {
  person: MergeablePerson;
  heading: string;
}) {
  return (
    <div className="border border-outline-variant bg-surface p-3">
      <dt className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
        {heading}
      </dt>
      <dd className="mt-0.5 truncate text-[13px] font-semibold text-on-surface">
        {person.displayName}
      </dd>
      <dd className="mt-1 text-[12px] leading-relaxed text-on-surface-variant">
        {person.relationshipState.replace(/_/g, " ")} ·{" "}
        {person.candidates} candidate record
        {person.candidates === 1 ? "" : "s"}
      </dd>
      {person.dnc && (
        <dd className="mt-1 text-[12px] leading-relaxed text-warn">
          Do not contact
          {person.dncReason ? ` — ${person.dncReason}` : ""}
        </dd>
      )}
    </div>
  );
}
