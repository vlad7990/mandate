import Link from "next/link";
import { CapabilityGate } from "@/components/auth/capability-gate";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { MastHead, type MastTone } from "@/components/ui/mast-head";
import { SkillRow, type SkillRowData } from "./skill-row";
import { IconIntelligence, IconPlus } from "@/components/icons";
import { PageShell, TerminalTitle } from "@/components/ui/page-shell";
import { cookies } from "next/headers";
import { SampleBanner } from "@/components/sample/sample-banner";
import {
  SAMPLE_DISMISSED_COOKIE,
  SAMPLE_SKILLS,
  shouldShowSample,
  type SampleSkill,
} from "@/lib/sample";

type SkillType = "role_skill" | "client_skill" | "search_skill";

type SkillRecord = {
  id: string;
  name: string;
  description: string;
  skill_type: SkillType;
  trigger_conditions: string;
  instructions: string;
  is_active: boolean;
  applies_to_project_id: string | null;
  updated_at: string;
};

type ProjectLite = {
  id: string;
  title: string;
};

const SKILL_TYPE_META: Record<
  SkillType,
  { label: string; tone: MastTone; blurb: string }
> = {
  search_skill: {
    label: "Search Skills",
    tone: "primary",
    blurb:
      "Apply to every search the org runs — calibration, evaluation, sourcing, comparison, and feedback.",
  },
  client_skill: {
    label: "Client Skills",
    tone: "secondary",
    blurb:
      "Org-wide rules captured from a client's recurring preferences. Same scope as search skills today; the type tags intent.",
  },
  role_skill: {
    label: "Role Skills",
    tone: "tertiary",
    blurb:
      "Targeted at one project. Only fires when an agent is invoked for that specific role.",
  },
};

const TYPE_ORDER: SkillType[] = ["search_skill", "client_skill", "role_skill"];

export default async function SkillsStudioPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id, status")
    .eq("id", user.id)
    .single<{ organization_id: string | null; status: string }>();

  if (!profile || profile.status !== "active" || !profile.organization_id) {
    redirect("/app/settings");
  }

  const [skillsQ, projectsQ] = await Promise.all([
    supabase
      .from("skills")
      .select(
        "id, name, description, skill_type, trigger_conditions, instructions, is_active, applies_to_project_id, updated_at"
      )
      .order("created_at", { ascending: true }),
    supabase
      .from("projects")
      .select("id, title")
      .order("created_at", { ascending: false }),
  ]);

  const skills = (skillsQ.data ?? []) as SkillRecord[];
  const projects = (projectsQ.data ?? []) as ProjectLite[];
  const projectById = new Map(projects.map((p) => [p.id, p.title]));

  const grouped: Record<SkillType, SkillRowData[]> = {
    search_skill: [],
    client_skill: [],
    role_skill: [],
  };

  for (const s of skills) {
    grouped[s.skill_type].push({
      ...s,
      applies_to_project_title: s.applies_to_project_id
        ? projectById.get(s.applies_to_project_id) ?? null
        : null,
    });
  }

  const totalActive = skills.filter((s) => s.is_active).length;

  // A skill is the most abstract object in the product, and the empty state
  // could only ever describe one. Three worked examples teach the shape —
  // trigger, instruction, scope — and make the precedence line above them
  // (Role > Client > Search) legible. Same rule as everywhere else: the
  // moment this org has one real skill, the sample never appears again.
  const dismissed =
    (await cookies()).get(SAMPLE_DISMISSED_COOKIE)?.value === "1";
  const showSample = shouldShowSample({
    hasRealData: skills.length > 0,
    dismissed,
  });

  return (
    <PageShell className="space-y-5">
      <SetBreadcrumbs
        crumbs={[
          { label: "Settings", href: "/app/settings" },
          { label: "Skills" },
        ]}
      />

      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-2 min-w-0">
          <TerminalTitle>SKILLS_STUDIO</TerminalTitle>
          <p className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest tabular-nums">
            <span className="text-primary">
              {String(totalActive).padStart(2, "0")}
            </span>{" "}
            active · {String(skills.length).padStart(2, "0")} total · injected
            into all six AI agents
          </p>
        </div>
        <CapabilityGate capability="skills:write">
          <Link
            href="/app/settings/skills/new"
            prefetch={false}
            className="px-3 py-1.5 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <IconPlus size={14} />
            New Skill
          </Link>
        </CapabilityGate>
      </header>

      <section className="bg-surface-container-low border border-outline-variant relative overflow-hidden">
        <div
          className="absolute inset-0 terminal-grid opacity-10 pointer-events-none"
          aria-hidden
        />
        <div className="relative px-5 py-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-on-surface">
          <PrincipleBlock
            title="What is a skill?"
            body="A reusable instruction block recruiters write once and the AI applies whenever its trigger conditions match."
          />
          <PrincipleBlock
            title="Where does it run?"
            body="Six agents: CV parsing, candidate evaluation, job spec, sourcing, feedback interpretation, and side-by-side comparison."
          />
          <PrincipleBlock
            title="Precedence"
            body="Role > Client > Search. The most specific active skill wins when two collide on the same input."
          />
        </div>
      </section>

      {skills.length === 0 ? (
        showSample ? <SampleSkills /> : <EmptyState />
      ) : (
        <div className="space-y-6">
          {TYPE_ORDER.map((type) => {
            const list = grouped[type];
            const meta = SKILL_TYPE_META[type];
            return (
              <section key={type} className="space-y-2">
                <MastHead
                  tone={meta.tone}
                  label={
                    <span className="flex items-baseline gap-2">
                      <span>{meta.label}</span>
                      <span className="text-outline tabular-nums">
                        · {String(list.length).padStart(2, "0")}
                      </span>
                    </span>
                  }
                  meta={
                    <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest hidden md:inline">
                      {meta.blurb}
                    </span>
                  }
                />
                {list.length === 0 ? (
                  <p className="bg-surface-container-low border border-outline-variant px-4 py-3 font-mono-label text-mono-label text-outline uppercase tracking-widest">
                    No {meta.label.toLowerCase()} configured yet.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {list.map((s) => (
                      <SkillRow key={s.id} skill={s} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}

function PrincipleBlock({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="space-y-1">
      <div className="font-mono-label text-mono-label text-primary uppercase tracking-widest">
        {title}
      </div>
      <p className="text-body-main text-on-surface-variant leading-relaxed">
        {body}
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-surface-container-low border border-outline-variant px-8 py-12 flex flex-col items-center text-center space-y-4 relative overflow-hidden">
      <div
        className="absolute inset-0 terminal-grid opacity-10 pointer-events-none"
        aria-hidden
      />
      <div className="relative w-16 h-16 border border-primary-container/40 bg-primary-container/10 flex items-center justify-center">
        <IconIntelligence size={28} className="text-primary" />
      </div>
      <div className="relative space-y-2 max-w-md">
        <h2 className="font-h2 text-h2 text-on-surface">No skills yet</h2>
        <p className="text-body-main text-on-surface-variant">
          Skills layer recruiter expertise on top of the default agent
          behaviour. Start with a search skill to capture an org-wide rule,
          or attach a role skill to a single project.
        </p>
      </div>
      <CapabilityGate capability="skills:write">
        <Link
          href="/app/settings/skills/new"
          prefetch={false}
          className="relative px-4 py-2 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <IconPlus size={16} />
          Create First Skill
        </Link>
      </CapabilityGate>
    </div>
  );
}

/**
 * The sample studio: three example skills in the same grouped shape the real
 * list uses, so the layout a recruiter learns here is the one they get.
 *
 * Read-only on purpose. The rows carry no toggle and no delete — they are not
 * this org's rows, and offering a control that cannot work would be worse
 * than the empty state it replaced. The create CTA is kept, because that is
 * the one action that *does* apply.
 */
function SampleSkills() {
  const grouped = TYPE_ORDER.map((type) => ({
    type,
    meta: SKILL_TYPE_META[type],
    rows: SAMPLE_SKILLS.filter((s) => s.skillType === type),
  }));

  return (
    <div className="space-y-5">
      <SampleBanner scope="skills" />

      <div className="space-y-6">
        {grouped.map(({ type, meta, rows }) => (
          <section key={type} className="space-y-2">
            <MastHead tone={meta.tone} label={meta.label} meta={meta.blurb} />
            <ul className="space-y-2">
              {rows.map((skill) => (
                <SampleSkillRow key={skill.id} skill={skill} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <CapabilityGate capability="skills:write">
        <Link
          href="/app/settings/skills/new"
          prefetch={false}
          className="inline-flex px-4 py-2 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <IconPlus size={16} />
          Create Your First Skill
        </Link>
      </CapabilityGate>
    </div>
  );
}

function SampleSkillRow({ skill }: { skill: SampleSkill }) {
  return (
    <li className="bg-surface-container-low border border-outline-variant px-4 py-3 space-y-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 space-y-1">
          <p className="text-body-main text-on-surface">{skill.name}</p>
          <p className="text-body-main text-on-surface-variant">
            {skill.description}
          </p>
        </div>
        <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline shrink-0">
          {skill.isActive ? "active" : "inactive"} · example
        </span>
      </div>

      <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
        <div>
          <dt className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
            Fires when
          </dt>
          <dd className="text-body-main text-on-surface-variant">
            {skill.triggerConditions}
          </dd>
        </div>
        {skill.appliesTo && (
          <div>
            <dt className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
              Scoped to
            </dt>
            <dd className="text-body-main text-on-surface-variant">
              {skill.appliesTo}
            </dd>
          </div>
        )}
      </dl>

      <div>
        <dt className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
          Instruction
        </dt>
        <dd className="text-body-main text-on-surface-variant">
          {skill.instructions}
        </dd>
      </div>
    </li>
  );
}
