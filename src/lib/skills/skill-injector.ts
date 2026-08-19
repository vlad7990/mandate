import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase-server";

// ────────────────────────────────────────────────────────────────────────
// Skills Studio injection layer.
//
// A "skill" is a recruiter-authored instruction block that augments an
// agent's system prompt for a specific run. Three flavours:
//
//   * search_skill — applies to every project in the org.
//   * client_skill — applies to every project run for one client
//     (`applies_to_client_id` is set). A client skill written before
//     migration 049 has no client to point at; those keep firing org-wide,
//     so null means "every client" rather than "no client".
//   * role_skill   — applies to one project (`applies_to_project_id` is
//     set) — only fires when the agent is invoked for that project.
//
// The agent runners call `loadActiveSkills` once per invocation, then
// pass the result through `injectSkillsIntoPrompt` to splice an
// "<active_skills>" XML block onto the end of the base system prompt.
// Anthropic's prompt convention treats trailing instructions as
// authoritative, so this is the right place to put recruiter overrides.
// ────────────────────────────────────────────────────────────────────────

export type SkillType = "role_skill" | "client_skill" | "search_skill";

export type ActiveSkill = {
  id: string;
  name: string;
  description: string;
  skill_type: SkillType;
  trigger_conditions: string;
  instructions: string;
  applies_to_project_id: string | null;
  applies_to_client_id: string | null;
};

export type SkillLoadOptions = {
  /**
   * Project the agent is running for. When provided, project-scoped
   * `role_skill` rows for that project are included; when null, only
   * org-wide skills load.
   */
  projectId: string | null;
  /**
   * Organization the caller belongs to. RLS already filters by
   * organization_id, but explicit filtering keeps the query selective
   * and serves as a defence-in-depth check.
   */
  organizationId: string | null;
  /**
   * Client the project is run for. Resolved from `projectId` when omitted,
   * which is why none of the eight agent runners had to change: they all
   * already pass a project, and the project knows its client.
   */
  clientId?: string | null;
  /**
   * Restrict to a subset of skill types. Defaults to "all relevant" —
   * search and client skills always load; role skills load only when
   * projectId is supplied.
   */
  types?: SkillType[];
  /**
   * Pre-built Supabase server client. Required when the caller runs
   * inside `after()`, where `cookies()` is unavailable.
   */
  client?: Awaited<ReturnType<typeof createServerSupabaseClient>>;
};

/**
 * Load every active skill that should fire for a given (org, project)
 * pair. RLS scopes by org; this function adds the project filter and
 * the active gate. Returns an empty array on any failure — skill
 * injection must never block agent execution.
 */
export async function loadActiveSkills(
  opts: SkillLoadOptions
): Promise<ActiveSkill[]> {
  if (!opts.organizationId) return [];

  try {
    // Callers running inside `after()` must supply the client — building
    // one here calls `cookies()`, which is unavailable there and silently
    // stripped every skill from the run.
    const supabase = opts.client ?? (await createServerSupabaseClient());

    // Build the OR filter inline:
    //   * org-wide: skill_type IN ('search_skill', 'client_skill')
    //   * project-specific: skill_type = 'role_skill'
    //                       AND applies_to_project_id = :projectId
    // The client is looked up here rather than threaded through every
    // caller. One extra cheap read, and a failure degrades to "no client",
    // which means client-scoped skills stay quiet while org-wide ones still
    // fire — never the other way round.
    let clientId = opts.clientId ?? null;
    if (clientId === null && opts.projectId) {
      const { data: project } = await supabase
        .from("projects")
        .select("client_id")
        .eq("id", opts.projectId)
        .maybeSingle<{ client_id: string | null }>();
      clientId = project?.client_id ?? null;
    }

    let query = supabase
      .from("skills")
      .select(
        "id, name, description, skill_type, trigger_conditions, instructions, applies_to_project_id, applies_to_client_id"
      )
      .eq("organization_id", opts.organizationId)
      .eq("is_active", true);

    if (opts.types && opts.types.length > 0) {
      query = query.in("skill_type", opts.types);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[skill-injector] failed to load skills:", error);
      return [];
    }

    const all = (data ?? []) as ActiveSkill[];

    // Filter project scope in code: role_skills only fire for their
    // own project; org-wide skills always fire. We do this here rather
    // than as a SQL OR because Supabase's PostgREST builder makes
    // disjunction across columns awkward and the row count is small.
    return all.filter((s) => {
      if (s.skill_type === "role_skill") {
        return (
          opts.projectId != null && s.applies_to_project_id === opts.projectId
        );
      }
      if (s.skill_type === "client_skill") {
        // Null client = the pre-049 org-wide rule; otherwise it must match.
        return (
          s.applies_to_client_id == null || s.applies_to_client_id === clientId
        );
      }
      return s.applies_to_project_id == null;
    });
  } catch (err) {
    console.error("[skill-injector] unexpected error loading skills:", err);
    return [];
  }
}

/**
 * Splice an "<active_skills>" block onto an existing system prompt. If
 * no skills are active the base prompt is returned unchanged so the
 * agent's behaviour is identical to the pre-Skills-Studio baseline.
 *
 * The block is appended (not prepended) because the model treats
 * later-in-the-system-prompt instructions as more authoritative — and
 * recruiter-authored skills SHOULD override the agent's defaults when
 * they conflict.
 */
export function injectSkillsIntoPrompt(
  basePrompt: string,
  skills: ActiveSkill[]
): string {
  if (skills.length === 0) return basePrompt;

  const blocks = skills.map((s) => formatSkillBlock(s)).join("\n\n");

  return `${basePrompt.trimEnd()}

---

<active_skills>
The following recruiter-authored skills are active for this run. Each
skill describes a behavioural override the recruiter wants applied
when its trigger conditions match the input. Apply skills additively;
when two skills conflict, prefer the more specific one (role_skill >
client_skill > search_skill). If a skill's trigger conditions clearly
do not match the input, ignore it silently.

${blocks}
</active_skills>`;
}

function formatSkillBlock(skill: ActiveSkill): string {
  const header = `<skill name="${escapeAttribute(skill.name)}" type="${skill.skill_type}">`;
  const desc = skill.description.trim();
  const trigger = skill.trigger_conditions.trim();
  const instructions = skill.instructions.trim();

  const parts = [header];
  if (desc) parts.push(`  <description>${escapeText(desc)}</description>`);
  if (trigger) parts.push(`  <when>${escapeText(trigger)}</when>`);
  parts.push(`  <do>${escapeText(instructions)}</do>`);
  parts.push(`</skill>`);
  return parts.join("\n");
}

function escapeAttribute(value: string): string {
  return value.replace(/"/g, "&quot;");
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ────────────────────────────────────────────────────────────────────────
// Convenience wrapper: load + inject in one call.
//
// Most agent runners just want the augmented prompt, not the raw skills
// list. This helper hides the two-step dance behind a single call. RLS
// failures, missing org context, etc. all degrade gracefully — the base
// prompt is returned unchanged so the agent never blocks on skills.
// ────────────────────────────────────────────────────────────────────────

export type AgentSkillContext = {
  /** Project the agent is running against, when applicable. */
  projectId: string | null;
  /** Organization that owns the project / candidate. */
  organizationId: string | null;
  /** Client, when the caller already knows it. Resolved from the project otherwise. */
  clientId?: string | null;
  /** Restrict to specific skill types. Defaults to all. */
  types?: SkillType[];
  /** Pre-built Supabase server client — required inside `after()`. */
  client?: Awaited<ReturnType<typeof createServerSupabaseClient>>;
};

export async function applySkillsToPrompt(
  basePrompt: string,
  ctx: AgentSkillContext
): Promise<string> {
  const skills = await loadActiveSkills({
    projectId: ctx.projectId,
    organizationId: ctx.organizationId,
    clientId: ctx.clientId ?? null,
    types: ctx.types,
    client: ctx.client,
  });
  return injectSkillsIntoPrompt(basePrompt, skills);
}
