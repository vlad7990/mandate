"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createSkillAction, updateSkillAction } from "./actions";

export type SkillType = "role_skill" | "client_skill" | "search_skill";

export type SkillFormProject = {
  id: string;
  title: string;
};

export type SkillFormInitial = {
  id: string | null;
  name: string;
  description: string;
  skill_type: SkillType;
  trigger_conditions: string;
  instructions: string;
  applies_to_project_id: string | null;
};

const TYPE_OPTIONS: Array<{
  value: SkillType;
  label: string;
  blurb: string;
  icon: string;
}> = [
  {
    value: "search_skill",
    label: "Search Skill",
    blurb:
      "Org-wide rule. Applies to every project's agents — calibration, sourcing, evaluation, comparison.",
    icon: "search",
  },
  {
    value: "client_skill",
    label: "Client Skill",
    blurb:
      "Org-wide rule that captures a recurring client preference. Same scope as a search skill.",
    icon: "domain",
  },
  {
    value: "role_skill",
    label: "Role Skill",
    blurb:
      "Targets one specific project. Only injected when an agent runs for that role.",
    icon: "psychology",
  },
];

export function SkillForm({
  initial,
  projects,
}: {
  initial: SkillFormInitial;
  projects: SkillFormProject[];
}) {
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [skillType, setSkillType] = useState<SkillType>(initial.skill_type);
  const [triggerConditions, setTriggerConditions] = useState(
    initial.trigger_conditions
  );
  const [instructions, setInstructions] = useState(initial.instructions);
  const [projectId, setProjectId] = useState<string>(
    initial.applies_to_project_id ?? ""
  );

  // role_skill needs a project; the other types must clear it. The
  // server action enforces this too — we mirror it client-side so the
  // recruiter doesn't get a server error after typing.
  const projectRequired = skillType === "role_skill";

  const handleTypeChange = (next: SkillType) => {
    setSkillType(next);
    if (next !== "role_skill") setProjectId("");
  };

  const previewSystemPrompt = useMemo(
    () => buildPreviewPrompt({ name, description, skillType, triggerConditions, instructions }),
    [name, description, skillType, triggerConditions, instructions]
  );

  const submitDisabled =
    isPending ||
    name.trim().length === 0 ||
    instructions.trim().length === 0 ||
    (projectRequired && !projectId);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitDisabled) return;

    const formData = new FormData();
    formData.set("name", name.trim());
    formData.set("description", description.trim());
    formData.set("skill_type", skillType);
    formData.set("trigger_conditions", triggerConditions.trim());
    formData.set("instructions", instructions.trim());
    formData.set("applies_to_project_id", projectId);

    startTransition(async () => {
      try {
        if (initial.id) {
          await updateSkillAction(initial.id, formData);
        } else {
          await createSkillAction(formData);
        }
      } catch (err) {
        // The action calls redirect() on success, which throws a
        // NEXT_REDIRECT signal that we MUST re-throw. Inspect the err
        // shape rather than swallowing everything.
        if (
          err &&
          typeof err === "object" &&
          "digest" in err &&
          typeof (err as { digest?: unknown }).digest === "string" &&
          (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
        ) {
          throw err;
        }
        const msg = err instanceof Error ? err.message : "Save failed.";
        toast.error(msg);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,420px)] gap-6">
        <div className="space-y-5">
          {/* Name + description */}
          <Field
            label="Name"
            id="skill-name"
            hint="Short, searchable. Recruiters see this in the Skills Studio list."
            required
          >
            <input
              id="skill-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface-container-lowest border border-outline-variant px-3 py-2 text-on-surface focus:border-primary focus:outline-none transition-colors"
              placeholder="e.g. Capital Markets Evaluation"
            />
          </Field>

          <Field
            label="Description"
            id="skill-description"
            hint="One sentence on what this skill does and who it helps."
          >
            <input
              id="skill-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-surface-container-lowest border border-outline-variant px-3 py-2 text-on-surface focus:border-primary focus:outline-none transition-colors"
              placeholder="Sharper evaluation lens for investment-banking roles."
            />
          </Field>

          {/* Type selector */}
          <fieldset className="space-y-2">
            <legend className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
              Skill Type
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {TYPE_OPTIONS.map((opt) => {
                const checked = skillType === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={cn(
                      "border px-3 py-3 cursor-pointer transition-colors",
                      checked
                        ? "border-primary bg-primary-container/10"
                        : "border-outline-variant bg-surface-container-low hover:border-primary"
                    )}
                  >
                    <input
                      type="radio"
                      name="skill_type"
                      value={opt.value}
                      checked={checked}
                      onChange={() => handleTypeChange(opt.value)}
                      className="sr-only"
                    />
                    <div className="flex items-baseline gap-1.5">
                      <span
                        className={cn(
                          "material-symbols-outlined text-[16px]",
                          checked ? "text-primary" : "text-outline"
                        )}
                        aria-hidden
                      >
                        {opt.icon}
                      </span>
                      <span
                        className={cn(
                          "font-mono-label text-mono-label uppercase tracking-widest",
                          checked ? "text-primary" : "text-on-surface"
                        )}
                      >
                        {opt.label}
                      </span>
                    </div>
                    <p className="mt-1.5 text-body-main text-on-surface-variant leading-snug">
                      {opt.blurb}
                    </p>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* Project picker (role_skill only) */}
          {projectRequired && (
            <Field
              label="Project"
              id="skill-project"
              hint="Role skills are scoped to a single project. Pick which one."
              required
            >
              {projects.length === 0 ? (
                <p className="border border-tertiary/40 bg-tertiary/10 px-3 py-2 text-tertiary text-body-main">
                  No projects available. Create a project first, or change the
                  skill type.
                </p>
              ) : (
                <select
                  id="skill-project"
                  required
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant px-3 py-2 text-on-surface focus:border-primary focus:outline-none transition-colors"
                >
                  <option value="">— Select a project —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}

          {/* Trigger conditions */}
          <Field
            label="Trigger Conditions"
            id="skill-trigger"
            hint="Plain English describing when the AI should apply this skill. The model reads it and decides whether to fire."
          >
            <textarea
              id="skill-trigger"
              value={triggerConditions}
              onChange={(e) => setTriggerConditions(e.target.value)}
              rows={3}
              className="w-full bg-surface-container-lowest border border-outline-variant px-3 py-2 font-mono-data text-body-main text-on-surface focus:border-primary focus:outline-none transition-colors resize-y leading-relaxed"
              placeholder="Apply when the role context references investment banking, capital markets, sell-side, equities, fixed income, or post-trade."
            />
          </Field>

          {/* Instructions */}
          <Field
            label="Instructions"
            id="skill-instructions"
            hint="Spliced verbatim into the agent's system prompt. Write what the AI should DO when this skill fires — be direct."
            required
          >
            <textarea
              id="skill-instructions"
              required
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={12}
              className="w-full bg-surface-container-lowest border border-outline-variant px-3 py-2 font-mono-data text-body-main text-on-surface focus:border-primary focus:outline-none transition-colors resize-y leading-relaxed"
              placeholder={INSTRUCTIONS_PLACEHOLDER}
            />
          </Field>
        </div>

        {/* Preview rail */}
        <aside className="space-y-3 lg:sticky lg:top-6 self-start">
          <div className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
            <span className="material-symbols-outlined text-[14px]" aria-hidden>
              code_blocks
            </span>
            Preview · Injected Prompt
          </div>
          <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest leading-snug">
            How this skill appears appended to every agent system prompt at
            run time.
          </p>
          <pre className="bg-surface-container-lowest border border-outline-variant text-on-surface-variant font-mono-data text-mono-data p-3 leading-relaxed whitespace-pre-wrap break-words max-h-[480px] overflow-auto">
            {previewSystemPrompt}
          </pre>
          <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest leading-snug">
            The XML wrapper isolates recruiter rules from the agent&rsquo;s
            base prompt. The model treats trailing instructions as
            authoritative.
          </p>
        </aside>
      </div>

      {/* Actions */}
      <footer className="flex items-center justify-between gap-3 border-t border-outline-variant pt-4 flex-wrap">
        <Link
          href="/app/settings/skills"
          prefetch={false}
          className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span className="material-symbols-outlined text-[14px]" aria-hidden>
            arrow_back
          </span>
          Cancel
        </Link>
        <button
          type="submit"
          disabled={submitDisabled}
          aria-busy={isPending ? true : undefined}
          className="px-4 py-2 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span
            className={cn(
              "material-symbols-outlined text-[14px]",
              isPending && "animate-spin"
            )}
            aria-hidden
          >
            {isPending ? "progress_activity" : "save"}
          </span>
          {isPending
            ? "Saving"
            : initial.id
              ? "Save Changes"
              : "Create Skill"}
        </button>
      </footer>

    </form>
  );
}

function Field({
  id,
  label,
  hint,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="font-mono-label text-mono-label text-outline uppercase tracking-widest flex items-center gap-1"
      >
        {label}
        {required && <span className="text-error">*</span>}
      </label>
      {children}
      {hint && (
        <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest leading-snug">
          {hint}
        </p>
      )}
    </div>
  );
}

const INSTRUCTIONS_PLACEHOLDER = `Push the evaluation beyond generic finance experience. Ask:
- Which asset class does the candidate own?
- Front office vs middle/back office.
- Have they shipped through a market crisis?
Where the CV is silent, flag the gap rather than assuming.`;

function buildPreviewPrompt({
  name,
  description,
  skillType,
  triggerConditions,
  instructions,
}: {
  name: string;
  description: string;
  skillType: SkillType;
  triggerConditions: string;
  instructions: string;
}): string {
  const safeName = name.trim() || "Untitled Skill";
  const safeInstructions = instructions.trim() || "(empty — fill in the Instructions field)";
  const lines: string[] = [];
  lines.push("...end of base agent prompt");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("<active_skills>");
  lines.push(`<skill name="${safeName}" type="${skillType}">`);
  if (description.trim()) {
    lines.push(`  <description>${description.trim()}</description>`);
  }
  if (triggerConditions.trim()) {
    lines.push(`  <when>${triggerConditions.trim()}</when>`);
  }
  lines.push(`  <do>${safeInstructions}</do>`);
  lines.push(`</skill>`);
  lines.push("</active_skills>");
  return lines.join("\n");
}
