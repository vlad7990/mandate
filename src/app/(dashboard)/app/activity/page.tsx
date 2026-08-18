import Link from "next/link";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  SAMPLE_CLIENTS,
  SAMPLE_DISMISSED_COOKIE,
  SAMPLE_MANDATES,
  sampleActivityFor,
  shouldShowSample,
} from "@/lib/sample";
import { SampleBanner } from "@/components/sample/sample-banner";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { ListPanel, PageShell, TerminalTitle } from "@/components/ui/page-shell";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Pagination } from "@/components/ui/pagination";
import {
  parseListParams,
  rangeFor,
  splitOverfetch,
  type RawSearchParams,
} from "@/lib/list-params";
import { getAccess } from "@/lib/auth/access";
import { can } from "@/lib/auth/roles";
import { describeActivity, describeActor, isMoneyEvent } from "@/lib/activity/describe";
import {
  ACTIVITY_EVENT_COLUMNS,
  ACTIVITY_GROUPS,
  ACTIVITY_GROUP_LABELS,
  ACTIVITY_GROUP_OF,
  parseActivityGroup,
  type ActivityEventRow,
  type ActivityEventType,
} from "@/lib/activity/types";

/**
 * The activity trail.
 *
 * Who changed what, newest first. Every row was written by a trigger on
 * the actual change or by the one RPC that stamps its own actor, so this
 * is a record of what happened rather than a record of what the
 * application remembered to mention.
 *
 * ## What each role sees, and why the page is not gated
 *
 * RLS filters the rows: a viewer gets placement and client-facing events,
 * a recruiter also gets the money, an admin also gets the member changes,
 * and a researcher gets the fee history of placements they are credited
 * on. The page itself has no capability requirement, because the honest
 * answer for every role is "here is what you may see", and hiding the
 * screen from a researcher would hide the trail of their own placements
 * from them.
 *
 * The filter list is built from what the reader can actually see, so a
 * viewer is not offered a Fees filter that returns nothing. That is a
 * courtesy, not a control — the emptiness would be enforced anyway.
 *
 * ## Why the group filter is not a `.in()` on event_type
 *
 * A group is a fixed set of event types, so filtering by group is an
 * `.in()` over that set rather than a `like 'fee_%'`. Prefix matching
 * would silently pick up any future event type that happened to start with
 * the same word, which is exactly the sort of drift an audit screen should
 * not have.
 */

const BASE_PATH = "/app/activity";

function eventTypesFor(group: string | undefined): ActivityEventType[] | null {
  const parsed = parseActivityGroup(group);
  if (!parsed) return null;
  return (Object.keys(ACTIVITY_GROUP_OF) as ActivityEventType[]).filter(
    (t) => ACTIVITY_GROUP_OF[t] === parsed
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const raw = await searchParams;
  const params = parseListParams(raw, {
    filters: ["group"],
    perPage: 50,
  });

  const supabase = await createServerSupabaseClient();
  const access = await getAccess();

  const seesFees = can(access?.role, "fees:read");
  const seesMembers = can(access?.role, "org:manage");

  const { from, to } = rangeFor(params);

  let query = supabase
    .from("activity_events")
    .select(ACTIVITY_EVENT_COLUMNS)
    .order("created_at", { ascending: false })
    .range(from, to);

  const types = eventTypesFor(params.filters.group);
  if (types) query = query.in("event_type", types);

  // Search is over the actor, because "what did this person do" is the
  // question people bring to an audit trail. It matches `actor_label` — the
  // name snapshotted at write time — rather than joining to `users`, so it
  // still finds the work of somebody who has since left.
  if (params.q) {
    query = query.ilike("actor_label", `%${params.q}%`);
  }

  const { data } = await query.returns<ActivityEventRow[]>();
  const real = splitOverfetch(data ?? [], params);

  /*
    Sample mode.

    The trail is a projection of everything else, so it is the last screen
    in the programme and the one with the least to invent: the rows below
    are `ActivityEventRow` objects that go through `describeActivity` and
    the same renderer as real ones, so the sample cannot word an event
    differently from the product or name an event type it does not have.

    Only ever shown on a genuinely empty trail, and only unfiltered — a
    reader who has typed a search or picked a group is asking a question
    about their own data, and answering it with invented rows would be a
    lie rather than an illustration.
    */
  const dismissed = (await cookies()).get(SAMPLE_DISMISSED_COOKIE)?.value === "1";
  const unfiltered = !params.q && !params.filters.group && params.page === 1;
  const showSample =
    unfiltered &&
    shouldShowSample({ hasRealData: (data ?? []).length > 0, dismissed });

  // Filtered by the reader's own capabilities, exactly as RLS would.
  const rows = showSample
    ? sampleActivityFor({ seesFees, seesMembers })
    : real.rows;
  const hasMore = showSample ? false : real.hasMore;

  // Names for the entities a row points at, resolved in one round trip each
  // rather than per row. RLS scopes all three, so a row whose subject the
  // reader cannot see simply renders without a link.
  // Never in sample mode: a sample id is not a uuid, so `.in("id", …)`
  // would hand PostgREST a `22P02` and the row would silently lose its
  // links. The fixture resolves its own names below.
  const projectIds = showSample
    ? []
    : ([...new Set(rows.map((r) => r.project_id).filter(Boolean))] as string[]);
  const candidateIds = showSample
    ? []
    : ([...new Set(rows.map((r) => r.candidate_id).filter(Boolean))] as string[]);
  const clientIds = showSample
    ? []
    : ([...new Set(rows.map((r) => r.client_id).filter(Boolean))] as string[]);

  const [{ data: projects }, { data: candidates }, { data: clients }] = await Promise.all([
    projectIds.length
      ? supabase.from("projects").select("id, title").in("id", projectIds)
      : Promise.resolve({ data: [] }),
    candidateIds.length
      ? supabase.from("candidates").select("id, full_name, project_id").in("id", candidateIds)
      : Promise.resolve({ data: [] }),
    clientIds.length
      ? supabase.from("clients").select("id, name").in("id", clientIds)
      : Promise.resolve({ data: [] }),
  ]);

  const projectById = new Map(
    showSample
      ? SAMPLE_MANDATES.map((m) => [m.id, { id: m.id, title: m.title }])
      : ((projects ?? []) as Array<{ id: string; title: string }>).map((p) => [p.id, p])
  );
  const candidateById = new Map(
    showSample
      ? []
      : ((candidates ?? []) as Array<{
          id: string;
          full_name: string;
          project_id: string;
        }>).map((c) => [c.id, c])
  );
  const clientById = new Map(
    showSample
      ? SAMPLE_CLIENTS.map((c) => [c.id, { id: c.id, name: c.name }])
      : ((clients ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c])
  );

  const availableGroups = ACTIVITY_GROUPS.filter((g) => {
    if (g === "money") return seesFees || access?.role === "researcher";
    if (g === "members") return seesMembers;
    return true;
  });

  return (
    <PageShell className="space-y-5">
      <SetBreadcrumbs crumbs={[{ label: "Activity" }]} />

      <div>
        <TerminalTitle>ACTIVITY_TRAIL</TerminalTitle>
        <p className="mt-2 font-mono-label text-mono-label uppercase leading-[1.5] tracking-widest text-on-surface-variant tabular-nums">
          {[
            "Who changed what",
            seesFees ? "Fees included" : "Fees restricted",
            seesMembers ? "Members included" : null,
            showSample ? "sample data" : null,
          ]
            .filter(Boolean)
            .join(" // ")}
        </p>
      </div>

      {showSample && <SampleBanner scope="activity trail" />}

      <ListPanel>
        <ListToolbar
          basePath={BASE_PATH}
          params={params}
          searchPlaceholder="Search by who did it…"
          filters={[
            {
              key: "group",
              label: "Type",
              options: availableGroups.map((g) => ({
                value: g,
                label: ACTIVITY_GROUP_LABELS[g],
              })),
            },
          ]}
        />

        {rows.length === 0 ? (
          <div className="px-[18px] py-8">
            <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
              Nothing recorded yet
            </p>
            <p className="mt-2 max-w-[68ch] text-body-s leading-relaxed text-on-surface-variant">
              The trail starts the first time something happens — a placement recorded, a
              fee changed, a member&apos;s role updated. It is written by the database on
              the change itself, so nothing that happens from here on can miss it.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-outline-variant/30">
            {rows.map((row) => {
              const project = row.project_id ? projectById.get(row.project_id) : null;
              const candidate = row.candidate_id ? candidateById.get(row.candidate_id) : null;
              const client = row.client_id ? clientById.get(row.client_id) : null;

              return (
                <li key={row.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline tabular-nums">
                      {formatWhen(row.created_at)}
                    </span>
                    <span className="font-mono-label text-[11px] uppercase tracking-[0.08em] text-primary">
                      {describeActor(row)}
                    </span>
                    {isMoneyEvent(row.event_type) && (
                      <span className="border border-outline-variant px-1.5 font-mono-label text-[10px] uppercase tracking-[0.08em] text-outline">
                        Fee
                      </span>
                    )}
                    {row.visibility === "admin" && (
                      <span className="border border-outline-variant px-1.5 font-mono-label text-[10px] uppercase tracking-[0.08em] text-outline">
                        Admin
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-body-s leading-relaxed text-on-surface">
                    {describeActivity(row)}
                  </p>

                  {(project || candidate || client) && (
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
                      {candidate && (
                        <Link
                          href={`/app/projects/${candidate.project_id}/candidates/${candidate.id}`}
                          prefetch={false}
                          className="hover:text-primary hover:underline"
                        >
                          {candidate.full_name}
                        </Link>
                      )}
                      {candidate && project && <span aria-hidden>{"//"}</span>}
                      {project && (
                        <Link
                          href={`/app/projects/${project.id}`}
                          prefetch={false}
                          className="hover:text-primary hover:underline"
                        >
                          {project.title}
                        </Link>
                      )}
                      {(candidate || project) && client && <span aria-hidden>{"//"}</span>}
                      {client && (
                        <Link
                          href={`/app/clients/${client.id}`}
                          prefetch={false}
                          className="hover:text-primary hover:underline"
                        >
                          {client.name}
                        </Link>
                      )}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <Pagination
          basePath={BASE_PATH}
          params={params}
          rowsOnPage={rows.length}
          hasMore={hasMore}
          noun="events"
        />
      </ListPanel>
    </PageShell>
  );
}
