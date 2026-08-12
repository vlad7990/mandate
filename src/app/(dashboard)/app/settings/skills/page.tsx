import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { BreadcrumbRail } from "@/components/ui/breadcrumb-rail";
import { MastHead, type MastTone } from "@/components/ui/mast-head";
import { SkillRow, type SkillRowData } from "./skill-row";

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

  return (
    <div className="px-6 py-6 space-y-5 max-w-[1400px] mx-auto">
      <BreadcrumbRail
        segments={[
          { label: "Mandate", href: "/app/home" },
          { label: "Settings", href: "/app/settings" },
          { label: "Skills" },
        ]}
      />

      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-2 min-w-0">
          <h1 className="font-h1 text-h1 text-on-surface tracking-tight">
            SKILLS_STUDIO
          </h1>
          <p className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest tabular-nums">
            <span className="text-primary">
              {String(totalActive).padStart(2, "0")}
            </span>{" "}
            active · {String(skills.length).padStart(2, "0")} total · injected
            into all six AI agents
          </p>
        </div>
        <Link
          href="/app/settings/skills/new"
          prefetch={false}
          className="px-3 py-1.5 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span className="material-symbols-outlined text-[14px]" aria-hidden>
            add
          </span>
          New Skill
        </Link>
      </header>

      <section className="bg-surface-container-low border border-outline-variant relative overflow-hidden">
        <div
          className="absolute inset-0 terminal-grid opacity-10 pointer-events-none"
          aria-hidden
        />
        <div className="relative px-5 py-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-on-surface">
          <PrincipleBlock
            icon="bolt"
            title="What is a skill?"
            body="A reusable instruction block recruiters write once and the AI applies whenever its trigger conditions match."
          />
          <PrincipleBlock
            icon="hub"
            title="Where does it run?"
            body="Six agents: CV parsing, candidate evaluation, job spec, sourcing, feedback interpretation, and side-by-side comparison."
          />
          <PrincipleBlock
            icon="layers"
            title="Precedence"
            body="Role > Client > Search. The most specific active skill wins when two collide on the same input."
          />
        </div>
      </section>

      {skills.length === 0 ? (
        <EmptyState />
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
    </div>
  );
}

function PrincipleBlock({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <div className="space-y-1">
      <div className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-1.5">
        <span className="material-symbols-outlined text-[14px]" aria-hidden>
          {icon}
        </span>
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
        <span
          className="material-symbols-outlined text-[28px] text-primary"
          style={{ fontVariationSettings: "'FILL' 1" }}
          aria-hidden
        >
          neurology
        </span>
      </div>
      <div className="relative space-y-2 max-w-md">
        <h2 className="font-h2 text-h2 text-on-surface">No skills yet</h2>
        <p className="text-body-main text-on-surface-variant">
          Skills layer recruiter expertise on top of the default agent
          behaviour. Start with a search skill to capture an org-wide rule,
          or attach a role skill to a single project.
        </p>
      </div>
      <Link
        href="/app/settings/skills/new"
        prefetch={false}
        className="relative px-4 py-2 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span className="material-symbols-outlined text-[16px]" aria-hidden>
          add
        </span>
        Create First Skill
      </Link>
    </div>
  );
}
