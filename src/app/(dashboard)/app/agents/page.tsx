import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { TerminalTitle } from "@/components/ui/page-shell";
import { MastHead, type MastTone } from "@/components/ui/mast-head";
import { StatusChip } from "@/components/ui/status-chip";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { IconIntelligence } from "@/components/icons";

// ────────────────────────────────────────────────────────────────────────
// The agent registry — every AI judgment in Mandate authenticates as a
// principal: its own database identity, its own credential, its own
// kill switch in Platform ops, its own name in the activity trail.
//
// The descriptions here are the durable half; status is read LIVE from
// the users table (role 'agent', org-scoped RLS), so a suspended agent
// reads SUSPENDED here the moment an operator flips it. Keyed by the
// principal's exact full_name — the same name the trail records.
// ────────────────────────────────────────────────────────────────────────

type AgentSpec = {
  /** Exact users.full_name of the principal — the join key. */
  name: string;
  /** What the agent judges, in one honest sentence. */
  does: string;
  /** The editorial or safety line it can never cross. */
  staysHuman: string;
};

type AgentGroup = {
  label: string;
  tone: MastTone;
  agents: AgentSpec[];
};

const REGISTRY: AgentGroup[] = [
  {
    label: "Candidate pipeline",
    tone: "primary",
    agents: [
      {
        name: "Intake Agent",
        does: "Turns a one-line role input into a structured mandate — role fields, inferred scope, and the missing-information list.",
        staysHuman: "The client registry: resolving and linking a client is always the recruiter's act.",
      },
      {
        name: "CV Parsing Agent",
        does: "Converts an uploaded CV into a structured profile — roles, domain, scale, tech exposure, archetype.",
        staysHuman: "It is handed file bytes per run; it holds no access to stored documents.",
      },
      {
        name: "Evaluation Agent",
        does: "Reviews a parsed candidate against the role: summary, strengths, weaknesses, risks, and fit.",
        staysHuman: "It writes exactly one evaluation field, and never before it has something to write.",
      },
      {
        name: "Ranking Agent",
        does: "Produces the multi-dimension scores, tier assignment, and leaderboard position for every candidate.",
        staysHuman: "The scoring model it applies is set by calibration — and recalibration follows your feedback.",
      },
      {
        name: "Feedback Interpreter",
        does: "Reads recruiter and hiring-manager feedback, interprets preference shifts, flags bias patterns and contradictions, and drives recalibration.",
        staysHuman: "Your feedback is persisted under your own name before the agent is ever asked to think about it.",
      },
      {
        name: "Positioning Agent",
        does: "For a candidate being submitted: narrative improvement, perception analysis, and gap identification.",
        staysHuman: "What is actually sent to a client is always your submission.",
      },
      {
        name: "Candidate Research Agent",
        does: "Builds the public-web dossier on a candidate using web search, with sources cited.",
        staysHuman: "Suspension refuses the run before any search is spent — it never searches unsupervised.",
      },
      {
        name: "Triangulation Agent",
        does: "Synthesises the three intelligence reports into the Triangulation Report. Pure synthesis — no web access.",
        staysHuman: "It reasons only over reports already in the record.",
      },
      {
        name: "Psychology Agent",
        does: "Profiles motivation and working style from human testimony — notes and recruiter context.",
        staysHuman: "Its access to notes is read-only by policy: it can never author testimony.",
      },
    ],
  },
  {
    label: "Company intelligence",
    tone: "secondary",
    agents: [
      {
        name: "Company Intelligence Agent",
        does: "One identity, two judgments: the company intelligence report and the hiring-manager dossier, both web-grounded.",
        staysHuman: "One kill switch covers both judgments.",
      },
      {
        name: "Culture Agent",
        does: "Profiles culture fit from the mandate and the feedback tail, carrying your context verbatim — and flagging that it did.",
        staysHuman: "If the evidence contradicts your prior, it surfaces the gap rather than rubber-stamping.",
      },
    ],
  },
  {
    label: "Sourcing & search",
    tone: "tertiary",
    agents: [
      {
        name: "Boolean Search Agent",
        does: "Generates the LinkedIn, Google X-Ray, and ATS query set — exact, broad, and adjacent variants.",
        staysHuman: "Query history is append-only to it: your edits and restores are never overwritten.",
      },
      {
        name: "Candidate Search Agent",
        does: "Ranks your own pool against a plain-English query on the AI Search page, and holds the sourcing search over configured web sources for candidates not yet in the pool.",
        staysHuman: "The sourcing side searches only domains your organisation has configured — never LinkedIn, by policy baked into the tool call.",
      },
    ],
  },
  {
    label: "Spec & calibration",
    tone: "primary",
    agents: [
      {
        name: "Calibration Agent",
        does: "Derives the scoring model's dimension weights from your onboarding answers; every derived weight is attributable to it in calibration history.",
        staysHuman: "Your answers are stored under your own session first — they are your act, not its input residue.",
      },
      {
        name: "Role Spec Agent",
        does: "Drafts the job spec onto your versioned placeholder, ready for your edit.",
        staysHuman: "It can neither touch a finalized spec nor finalize one — the canonical version is always yours.",
      },
    ],
  },
  {
    label: "Delivery & oversight",
    tone: "secondary",
    agents: [
      {
        name: "Shortlist Agent",
        does: "Writes the submission-ready shortlist report over the slate you composed, with trade-off analysis.",
        staysHuman: "It can neither modify a submitted slate nor submit one — what was sent never silently changes.",
      },
      {
        name: "Desk Digest Agent",
        does: "Writes the manager's desk digest — what moved, what stalled, what to do about it.",
        staysHuman: "It sees nothing itself: the rollup arrives pre-assembled, and its whole reach is one append-only record.",
      },
      {
        name: "Search Health Agent",
        does: "Two judgments: pipeline health suggestions when a search is genuinely degraded, and the weekly client report.",
        staysHuman: "A healthy search gets no suggestions — the agent applies that gate itself.",
      },
      {
        name: "Copilot Agent",
        does: "The always-available chat: answers questions over the project snapshot and explains decisions.",
        staysHuman: "Your session proves you may ask before the agent exists; conversation history stays on your device.",
      },
      {
        name: "Executive Intelligence Agent",
        does: "One identity, three judgments for executive searches: the web-grounded company operating context, the success profile, and the interview plan.",
        staysHuman: "It touches drafts only — approval is pinned to humans in the database itself, and it can never sign a human's name in the executive ledger.",
      },
    ],
  },
];

type AgentRow = {
  full_name: string | null;
  status: string;
  created_at: string | null;
};

export default async function AgentsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const [{ data: profile }, { data: agentRows }] = await Promise.all([
    supabase
      .from("users")
      .select("is_founder")
      .eq("id", user.id)
      .maybeSingle<{ is_founder: boolean }>(),
    supabase
      .from("users")
      .select("full_name, status, created_at")
      .eq("role", "agent")
      .order("created_at", { ascending: true }),
  ]);

  const rows = (agentRows ?? []) as AgentRow[];
  const byName = new Map(rows.map((r) => [r.full_name ?? "", r]));
  const documented = new Set(
    REGISTRY.flatMap((g) => g.agents.map((a) => a.name))
  );
  // An agent provisioned in the workspace but not yet documented here —
  // rendered rather than hidden, because a principal that exists must
  // never be invisible on the page that claims to list them all.
  const undocumented = rows.filter((r) => !documented.has(r.full_name ?? ""));

  const active = rows.filter((r) => r.status === "active").length;
  const suspended = rows.length - active;

  return (
    <div className="px-6 py-6 space-y-6 max-w-[1200px] mx-auto">
      <SetBreadcrumbs crumbs={[{ label: "Agents" }]} />

      <header className="space-y-2">
        <TerminalTitle label="Agent registry">AGENT_REGISTRY</TerminalTitle>
        <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
          {rows.length} principals {"//"} {active} active
          {suspended > 0 ? ` // ${suspended} suspended` : ""}
        </p>
        <p className="text-body-main text-on-surface-variant max-w-3xl">
          Every AI judgment in Mandate runs as a principal: its own
          identity in the database, its own credential, its own kill
          switch, and its own name in the activity trail. No agent acts as
          you, and none can cross the editorial lines below — those are
          enforced in the database, not in a prompt.
        </p>
      </header>

      {REGISTRY.map((group) => (
        <section key={group.label} className="space-y-3">
          <MastHead
            tone={group.tone}
            label={group.label}
            meta={
              <span className="tabular-nums">
                {String(group.agents.length).padStart(2, "0")}
              </span>
            }
          />
          <ul className="space-y-2">
            {group.agents.map((agent) => {
              const row = byName.get(agent.name);
              return (
                <li
                  key={agent.name}
                  className="bg-surface-container-low border border-outline-variant px-4 py-3 space-y-1.5"
                >
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <h3 className="font-h2 text-h2 text-on-surface">
                      {agent.name}
                    </h3>
                    {row ? (
                      <StatusChip
                        tone={row.status === "active" ? "secondary" : "danger"}
                      >
                        {row.status}
                      </StatusChip>
                    ) : (
                      <StatusChip tone="neutral" intensity="soft">
                        not provisioned
                      </StatusChip>
                    )}
                    {row?.created_at && (
                      <span className="ml-auto font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
                        Since {formatDate(row.created_at)}
                      </span>
                    )}
                  </div>
                  <p className="text-body-main text-on-surface leading-relaxed">
                    {agent.does}
                  </p>
                  <p className="text-body-main text-on-surface-variant leading-relaxed">
                    <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline mr-2">
                      Stays human:
                    </span>
                    {agent.staysHuman}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {undocumented.length > 0 && (
        <section className="space-y-3">
          <MastHead tone="neutral" label="Undocumented principals" />
          <ul className="space-y-2">
            {undocumented.map((r) => (
              <li
                key={r.full_name}
                className="bg-surface-container-low border border-outline-variant px-4 py-3 flex items-baseline gap-3"
              >
                <h3 className="font-h2 text-h2 text-on-surface">
                  {r.full_name}
                </h3>
                <StatusChip
                  tone={r.status === "active" ? "secondary" : "danger"}
                >
                  {r.status}
                </StatusChip>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="pt-2 space-y-1">
        <p className="font-mono-label text-mono-label text-outline uppercase tracking-wider flex items-center gap-2">
          <IconIntelligence size={14} className="text-primary" />
          Agents read your Skills Studio instructions on every run — steer
          them from Skills Studio.
        </p>
        {profile?.is_founder && (
          <p className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
            Suspend or restore any principal from Platform ops — each kill
            switch is independent of the other nineteen.
          </p>
        )}
      </footer>
    </div>
  );
}

function formatDate(value: string): string {
  return new Date(value)
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })
    .toUpperCase();
}
