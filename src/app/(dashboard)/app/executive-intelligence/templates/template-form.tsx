"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { unwrap } from "@/lib/actions/result";
import type { ActionResult } from "@/lib/actions/result";
import { ROLE_FAMILIES, TEMPLATE_DEFAULT_FIELDS } from "./template-fields";

const inputClass =
  "w-full bg-surface-container-low border border-outline-variant px-3 py-2 text-body-main text-on-surface placeholder:text-outline focus:border-primary focus:ring-0 outline-none transition-colors";

const labelClass =
  "font-mono-label text-mono-label uppercase tracking-widest text-on-surface-variant";

export type TemplateFormValues = {
  title: string;
  key: string;
  summary: string;
  role_family: string;
  intake_defaults: Record<string, unknown>;
  competency_weights: Array<{ competency_key: string; weight: number }>;
};

export type CompetencyOption = {
  key: string;
  name: string;
  category: string;
};

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

/**
 * One form for create and edit. The server action is passed in so the
 * two pages differ only in what they bind — the fields, the caps and
 * the shadow warning stay identical.
 */
export function TemplateForm({
  action,
  initial,
  competencies,
  globalKeys,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  initial: TemplateFormValues | null;
  competencies: CompetencyOption[];
  /** Keys of the global library — typing one of them is shadowing. */
  globalKeys: string[];
  submitLabel: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [key, setKey] = useState(initial?.key ?? "");
  const [keyTouched, setKeyTouched] = useState(initial != null);

  const weightOf = (compKey: string): number => {
    const found = initial?.competency_weights?.find(
      (w) => w.competency_key === compKey
    );
    return found?.weight ?? 0;
  };
  const defaultOf = (name: string): string => {
    const v = initial?.intake_defaults?.[name];
    return typeof v === "string" ? v : "";
  };

  const shadows = globalKeys.includes(key);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        unwrap(await action(formData));
        // The action redirects on success; nothing to do here.
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Save failed.";
        console.error("[ei/templates] save failed:", err);
        toast.error(msg);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className={labelClass}>Title *</span>
            <input
              name="title"
              required
              maxLength={120}
              defaultValue={initial?.title ?? ""}
              placeholder="e.g. CTO — Regulated Marketplace"
              className={inputClass}
              onChange={(e) => {
                if (!keyTouched) setKey(slugify(e.target.value));
              }}
            />
          </label>
          <label className="space-y-1.5">
            <span className={labelClass}>Key *</span>
            <input
              name="key"
              required
              maxLength={80}
              pattern="[a-z0-9_]+"
              value={key}
              onChange={(e) => {
                setKeyTouched(true);
                setKey(e.target.value);
              }}
              placeholder="e.g. cto_regulated_marketplace"
              className={inputClass}
            />
            {shadows && (
              <span className="block font-mono-label text-[11px] uppercase tracking-wider text-tertiary">
                Overrides the global template of the same key for your
                organisation
              </span>
            )}
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className={labelClass}>Summary</span>
          <textarea
            name="summary"
            maxLength={300}
            rows={2}
            defaultValue={initial?.summary ?? ""}
            placeholder="One line on the card: who this template is for."
            className={inputClass}
          />
        </label>

        <label className="block max-w-xs space-y-1.5">
          <span className={labelClass}>Role family</span>
          <select
            name="role_family"
            defaultValue={initial?.role_family ?? "other"}
            className={inputClass}
          >
            {ROLE_FAMILIES.map((f) => (
              <option key={f} value={f}>
                {f.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
            Intake defaults
          </h2>
          <p className="text-body-s text-on-surface-variant">
            All optional. Whatever you fill in prefills the executive intake —
            everything stays editable there.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {TEMPLATE_DEFAULT_FIELDS.map((f) => (
            <label
              key={f.name}
              className={f.long ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}
            >
              <span className={labelClass}>{f.label}</span>
              {f.long ? (
                <textarea
                  name={`default_${f.name}`}
                  maxLength={1000}
                  rows={2}
                  defaultValue={defaultOf(f.name)}
                  className={inputClass}
                />
              ) : (
                <input
                  name={`default_${f.name}`}
                  maxLength={1000}
                  defaultValue={defaultOf(f.name)}
                  className={inputClass}
                />
              )}
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
            Competency weights
          </h2>
          <p className="text-body-s text-on-surface-variant">
            0 leaves a competency out. Weighted competencies are seeded onto
            every search created from this template.
          </p>
        </div>
        <ul className="divide-y divide-outline-variant/40 border border-outline-variant bg-surface-container-low">
          {competencies.map((c) => (
            <li key={c.key} className="flex items-center gap-3 px-4 py-2.5">
              <input type="hidden" name="competency_key" value={c.key} />
              <span className="min-w-0 flex-1 truncate text-body-main text-on-surface">
                {c.name}
              </span>
              <span className="hidden font-mono-label text-[11px] uppercase tracking-wider text-outline sm:inline">
                {c.category.replace(/_/g, " ")}
              </span>
              <input
                type="number"
                name={`weight_${c.key}`}
                min={0}
                max={100}
                step={1}
                defaultValue={weightOf(c.key) || ""}
                placeholder="0"
                aria-label={`Weight for ${c.name}`}
                className="w-20 border border-outline-variant bg-surface px-2 py-1 text-right font-mono-data text-[13px] tabular-nums text-on-surface outline-none transition-colors focus:border-primary"
              />
            </li>
          ))}
        </ul>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="btn-notch bg-primary-container px-6 py-3 font-mono-label text-mono-label uppercase tracking-widest text-on-primary-container transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
