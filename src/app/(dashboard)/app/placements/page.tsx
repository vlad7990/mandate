import Link from "next/link";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { ListPanel, PageShell, TerminalTitle } from "@/components/ui/page-shell";
import { SampleBanner } from "@/components/sample/sample-banner";
import {
  SAMPLE_DISMISSED_COOKIE,
  SAMPLE_PLACEMENTS,
  SAMPLE_REVENUE,
  shouldShowSample,
} from "@/lib/sample";
import { getAccess } from "@/lib/auth/access";
import { can } from "@/lib/auth/roles";
import {
  billedInPeriod,
  formatMoney,
  guaranteeState,
  GUARANTEE_STATE_LABELS,
  pipelineValue,
  quarterOf,
  recentQuarters,
} from "@/lib/fees/compute";
import {
  FEE_LINE_COLUMNS,
  PLACEMENT_COLUMNS,
  PLACEMENT_STATUS_LABELS,
  type FeeLineRow,
  type PlacementRow,
  type PlacementStatus,
} from "@/lib/fees/types";
import { StatusChip, type ChipTone } from "@/components/ui/status-chip";
import { computeObjectiveProgress } from "@/lib/okrs/progress";
import {
  KEY_RESULT_COLUMNS,
  KEY_RESULT_STATUS_LABELS,
  OBJECTIVE_COLUMNS,
  type KeyResultRow,
  type KeyResultStatus,
  type ObjectiveRow,
} from "@/lib/okrs/types";

/**
 * The revenue book — the screen that answers "what did we bill this
 * quarter".
 *
 * That question is the acceptance test for the whole placement record, so
 * it is the headline here rather than something you reach by filtering a
 * list. Everything else on the page exists to make the number
 * interrogable: the four quarters behind it, the placements that make it
 * up, and what is booked but not yet earned.
 *
 * ## What each role sees
 *
 * A researcher or viewer holds `org:read` but not `fees:read`, so RLS
 * sends them the placements and none of the fee lines. Rather than
 * showing them a revenue page reading zero — which is a lie, not a
 * restriction — the page says so and shows the placement list without the
 * money columns. A researcher credited on a placement does see that
 * placement's fee, which is why the totals here are computed from
 * whatever lines RLS actually returned rather than from a count the
 * server assumes.
 *
 * The list is not paginated, on the same reasoning as the client list:
 * placements are bounded by how many searches an agency closes, which is
 * two orders of magnitude below its candidate count. It wants
 * `parseListParams` the day that stops being true.
 */

type PlacementListRow = PlacementRow & {
  candidates: { full_name: string } | null;
  projects: { title: string } | null;
  clients: { name: string } | null;
};

const OKR_CHIP: Record<KeyResultStatus, ChipTone> = {
  on_track: "secondary",
  met: "primary",
  behind: "warn",
  at_risk: "danger",
  pending: "neutral",
};

const STATUS_TONE: Record<PlacementStatus, string> = {
  offered: "text-on-surface-variant",
  declined: "text-outline",
  accepted: "text-primary",
  started: "text-primary",
  fell_through: "text-tertiary",
};

export default async function PlacementsPage() {
  const supabase = await createServerSupabaseClient();
  const access = await getAccess();

  const seesFees = can(access?.role, "fees:read");
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: placementRows }, { data: lineRows }, { data: orgRow }] = await Promise.all([
    supabase
      .from("placements")
      .select(
        `${PLACEMENT_COLUMNS}, candidates(full_name), projects(title), clients(name)`
      )
      .order("offer_date", { ascending: false })
      .returns<PlacementListRow[]>(),
    // RLS decides how much of this comes back. A viewer gets an empty
    // array and every total below is honestly zero-of-nothing rather than
    // a redacted figure.
    supabase
      .from("placement_fee_lines")
      .select(FEE_LINE_COLUMNS)
      .returns<FeeLineRow[]>(),
    access?.organizationId
      ? supabase
          .from("organizations")
          .select("base_currency")
          .eq("id", access.organizationId)
          .maybeSingle<{ base_currency: string }>()
      : Promise.resolve({ data: null }),
  ]);

  // The financial-objective strip (107, D4). The KR rows are the
  // fees-tier: RLS returns them only under fees:read, so this arrives
  // empty for exactly the roles the "Fees restricted" panel addresses.
  const [{ data: objectiveRows }, { data: financialKrRows }, { data: okrMemberRows }] =
    await Promise.all([
      supabase
        .from("objectives")
        .select(OBJECTIVE_COLUMNS)
        .eq("status", "active")
        .order("period_end", { ascending: true })
        .returns<ObjectiveRow[]>(),
      supabase
        .from("objective_key_results")
        .select(KEY_RESULT_COLUMNS)
        .eq("kind", "financial")
        .order("created_at", { ascending: true })
        .returns<KeyResultRow[]>(),
      supabase.from("users").select("id, full_name, email"),
    ]);

  const okrMemberLabel = new Map(
    (okrMemberRows ?? []).map((m: { id: string; full_name: string | null; email: string }) => [
      m.id,
      m.full_name || m.email,
    ])
  );
  const financialByObjective = new Map<string, KeyResultRow[]>();
  for (const kr of financialKrRows ?? []) {
    const bucket = financialByObjective.get(kr.objective_id);
    if (bucket) bucket.push(kr);
    else financialByObjective.set(kr.objective_id, [kr]);
  }
  const okrObjectives = (objectiveRows ?? []).filter((o) => financialByObjective.has(o.id));
  const okrProgress = await Promise.all(
    okrObjectives.map((o) =>
      computeObjectiveProgress(o, financialByObjective.get(o.id) ?? [], supabase)
    )
  );
  const financialLines = okrObjectives.flatMap((o, i) => {
    const progress = new Map(okrProgress[i].map((p) => [p.keyResultId, p]));
    return (financialByObjective.get(o.id) ?? []).map((kr) => ({
      id: kr.id,
      label: kr.label,
      objectiveTitle: o.title,
      ownerLabel: okrMemberLabel.get(o.owner_user_id) ?? "unknown",
      periodEnd: o.period_end,
      currency: kr.currency ?? orgRow?.base_currency ?? "USD",
      target: kr.target_value === null ? 0 : Number(kr.target_value),
      current: progress.get(kr.id)?.current ?? 0,
      status: progress.get(kr.id)?.status ?? ("pending" as KeyResultStatus),
    }));
  });

  const placements = placementRows ?? [];
  const lines = lineRows ?? [];
  const baseCurrency = orgRow?.base_currency ?? "USD";

  const thisQuarter = quarterOf(today);
  const quarters = recentQuarters(today, 4);
  const billedThisQuarter = billedInPeriod(lines, thisQuarter);
  const outstanding = pipelineValue(lines);

  const linesByPlacement = new Map<string, FeeLineRow[]>();
  for (const line of lines) {
    const bucket = linesByPlacement.get(line.placement_id);
    if (bucket) bucket.push(line);
    else linesByPlacement.set(line.placement_id, [line]);
  }

  const started = placements.filter((p) => p.status === "started").length;
  const inGuarantee = placements.filter(
    (p) => guaranteeState(p, today) === "running"
  ).length;

  // An empty revenue screen is four zeroes and a sentence, which teaches
  // nothing about the one question this page exists to answer. The sample
  // shows a part-billed retainer, a fee earned in full, a placement inside
  // its guarantee and a clawback — the states that make the quarter columns
  // mean something. It never mixes with real rows: `hasRealData` is any
  // placement at all, so the first one recorded replaces it for good.
  const dismissed = (await cookies()).get(SAMPLE_DISMISSED_COOKIE)?.value === "1";
  const showSample =
    seesFees && shouldShowSample({ hasRealData: placements.length > 0, dismissed });

  return (
    <PageShell className="space-y-5">
      <SetBreadcrumbs crumbs={[{ label: "Placements" }]} />

      <div>
        <TerminalTitle>PLACEMENTS_AND_FEES</TerminalTitle>
        <p className="mt-2 font-mono-label text-mono-label uppercase leading-[1.5] tracking-widest text-on-surface-variant tabular-nums">
          {showSample
            ? `${SAMPLE_PLACEMENTS.length} example placements // sample data`
            : [
                `${placements.length} placement${placements.length === 1 ? "" : "s"}`,
                `${started} started`,
                `${inGuarantee} in guarantee`,
                seesFees ? `Base ${baseCurrency}` : "Fees restricted",
              ].join(" // ")}
        </p>
      </div>

      {showSample && <SampleBanner scope="placements" />}

      {showSample ? (
        <SampleRevenue baseCurrency={baseCurrency} quarters={quarters.map((q) => q.label)} />
      ) : seesFees ? (
        <>
          <div className="grid grid-cols-1 gap-px border border-outline-variant bg-outline-variant sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              label={`Billed ${thisQuarter.label}`}
              value={formatMoney(billedThisQuarter, baseCurrency)}
              hint="Earned instalments less reversals"
            />
            <Tile
              label="Booked, not yet earned"
              value={formatMoney(outstanding, baseCurrency)}
              hint="Pending instalments across live placements"
            />
            <Tile
              label="Placements started"
              value={String(started)}
              hint="Candidates who have begun"
            />
            <Tile
              label="Inside guarantee"
              value={String(inGuarantee)}
              hint="Still at risk of a clawback"
            />
          </div>

          <ListPanel>
            <div className="border-b border-outline-variant px-[18px] py-[15px]">
              <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
                Billed by quarter
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-outline-variant/60">
                    {quarters.map((q) => (
                      <th
                        key={q.label}
                        className="px-4 py-2.5 font-mono-label text-[11px] font-normal uppercase tracking-[0.08em] text-outline"
                      >
                        {q.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {quarters.map((q) => {
                      const value = billedInPeriod(lines, q);
                      return (
                        <td
                          key={q.label}
                          className={`px-4 py-3 font-h1 text-[18px] tabular-nums ${
                            value < 0 ? "text-tertiary" : "text-on-surface"
                          }`}
                        >
                          {formatMoney(value, baseCurrency)}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </ListPanel>

          {financialLines.length > 0 && (
            <ListPanel>
              <div className="flex items-center justify-between border-b border-outline-variant px-[18px] py-[15px]">
                <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
                  Financial objectives
                </h2>
                <Link
                  href="/app/objectives"
                  prefetch={false}
                  className="font-mono-label text-mono-label uppercase tracking-widest text-outline transition-colors hover:text-primary"
                >
                  All objectives
                </Link>
              </div>
              <div className="divide-y divide-outline-variant/40">
                {financialLines.map((line) => (
                  <div
                    key={line.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-[18px] py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-body-s text-on-surface">{line.label}</span>
                      <span className="ml-2 font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
                        {line.objectiveTitle} · {line.ownerLabel} · to {line.periodEnd}
                      </span>
                    </div>
                    <span className="font-mono-label text-mono-label tabular-nums text-on-surface">
                      {formatMoney(line.current, line.currency)}
                      <span className="text-outline"> / {formatMoney(line.target, line.currency)}</span>
                    </span>
                    <StatusChip tone={OKR_CHIP[line.status]} dot pulse={line.status === "at_risk"}>
                      {KEY_RESULT_STATUS_LABELS[line.status]}
                    </StatusChip>
                  </div>
                ))}
              </div>
            </ListPanel>
          )}
        </>
      ) : (
        <div className="border border-outline-variant bg-surface-container-low px-[18px] py-4">
          <p className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
            Fees restricted
          </p>
          <p className="mt-2 max-w-[68ch] text-body-s leading-relaxed text-on-surface-variant">
            Your role can see that these placements happened but not what they billed.
            Fee terms, amounts and the revenue book are visible to admins and recruiters,
            and to whoever is credited on an individual placement. The placements below
            are the full list — nothing is hidden from it.
          </p>
        </div>
      )}

      <ListPanel>
        <div className="border-b border-outline-variant px-[18px] py-[15px]">
          <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
            All placements
          </h2>
        </div>

        {showSample ? (
          <SamplePlacementRows baseCurrency={baseCurrency} />
        ) : placements.length === 0 ? (
          <div className="px-[18px] py-8">
            <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
              No placements recorded
            </p>
            <p className="mt-2 max-w-[68ch] text-body-s leading-relaxed text-on-surface-variant">
              A placement is recorded from the candidate who got the offer — open a
              candidate and use the Placement &amp; fee tab. Everything on this page is
              computed from those records.
            </p>
          </div>
        ) : (
          // `relative` on the scroll wrapper: `sr-only` is `position:
          // absolute`, so without a positioned ancestor its containing block
          // is the root and it extends the document's scrollable width past
          // the overflow that should have clipped it. That bug made the whole
          // Members page scroll sideways in an earlier session.
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left">
              <thead>
                <tr className="border-b border-outline-variant/60">
                  <Th>Candidate</Th>
                  <Th>Mandate</Th>
                  <Th>Client</Th>
                  <Th>Status</Th>
                  <Th>Start</Th>
                  <Th>Guarantee</Th>
                  {seesFees && <Th align="right">Fee</Th>}
                  {seesFees && <Th align="right">Billed</Th>}
                </tr>
              </thead>
              <tbody>
                {placements.map((placement) => {
                  const own = linesByPlacement.get(placement.id) ?? [];
                  // A credited researcher sees their own placement's lines
                  // even without the capability, so this is computed per row
                  // from what came back rather than gated on `seesFees`.
                  const visible = own.length > 0;
                  const booked = visible
                    ? own
                        .filter((l) => l.status !== "cancelled")
                        .reduce((sum, l) => sum + l.base_amount, 0)
                    : 0;
                  const billed = visible
                    ? own
                        .filter((l) => l.status === "earned")
                        .reduce((sum, l) => sum + l.base_amount, 0)
                    : 0;
                  const guarantee = guaranteeState(placement, today);

                  return (
                    <tr
                      key={placement.id}
                      className="border-b border-outline-variant/30 last:border-0"
                    >
                      {/* max-w-0 is what makes `truncate` bite in a table cell —
                          without it the column sizes to its longest name. */}
                      <td className="max-w-0 px-4 py-3">
                        <Link
                          href={`/app/projects/${placement.project_id}/candidates/${placement.candidate_id}`}
                          prefetch={false}
                          className="block truncate text-body-s text-on-surface hover:text-primary hover:underline"
                        >
                          {placement.candidates?.full_name ?? "Unknown"}
                        </Link>
                      </td>
                      <td className="max-w-0 px-4 py-3">
                        <Link
                          href={`/app/projects/${placement.project_id}`}
                          prefetch={false}
                          className="block truncate text-body-s text-on-surface-variant hover:text-primary hover:underline"
                        >
                          {placement.projects?.title ?? "—"}
                        </Link>
                      </td>
                      <td className="max-w-0 truncate px-4 py-3 text-body-s text-on-surface-variant">
                        {placement.clients?.name ?? "—"}
                      </td>
                      <td
                        className={`px-4 py-3 font-mono-label text-[11px] uppercase tracking-[0.08em] ${
                          STATUS_TONE[placement.status]
                        }`}
                      >
                        {PLACEMENT_STATUS_LABELS[placement.status]}
                      </td>
                      <td className="px-4 py-3 font-mono-label text-[11px] tracking-[0.08em] text-outline tabular-nums">
                        {placement.start_date ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
                        {GUARANTEE_STATE_LABELS[guarantee]}
                      </td>
                      {seesFees && (
                        <td className="px-4 py-3 text-right font-mono-label text-mono-label text-on-surface tabular-nums">
                          {visible ? formatMoney(booked, baseCurrency) : "—"}
                        </td>
                      )}
                      {seesFees && (
                        <td
                          className={`px-4 py-3 text-right font-mono-label text-mono-label tabular-nums ${
                            billed < 0 ? "text-tertiary" : "text-on-surface-variant"
                          }`}
                        >
                          {visible ? formatMoney(billed, baseCurrency) : "—"}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ListPanel>
    </PageShell>
  );
}

/**
 * The sample tiles and quarter row.
 *
 * Figures come from `SAMPLE_REVENUE` written out longhand rather than
 * summed from `SAMPLE_PLACEMENTS`, because a fixture that computes itself
 * can only ever agree with itself — the point of these numbers is to show
 * a shape a real book has (a clawback quarter below the ones around it),
 * not to demonstrate that addition works.
 */
function SampleRevenue({
  baseCurrency,
  quarters,
}: {
  baseCurrency: string;
  quarters: string[];
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-px border border-outline-variant bg-outline-variant sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label={`Billed ${quarters[quarters.length - 1]}`}
          value={formatMoney(SAMPLE_REVENUE.billedThisQuarter, baseCurrency)}
          hint="Earned instalments less reversals"
        />
        <Tile
          label="Booked, not yet earned"
          value={formatMoney(SAMPLE_REVENUE.outstanding, baseCurrency)}
          hint="Pending instalments across live placements"
        />
        <Tile
          label="Placements started"
          value={String(SAMPLE_REVENUE.started)}
          hint="Candidates who have begun"
        />
        <Tile
          label="Inside guarantee"
          value={String(SAMPLE_REVENUE.inGuarantee)}
          hint="Still at risk of a clawback"
        />
      </div>

      <ListPanel>
        <div className="border-b border-outline-variant px-[18px] py-[15px]">
          <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
            Billed by quarter
          </h2>
        </div>
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left">
            <thead>
              <tr className="border-b border-outline-variant/60">
                {quarters.map((label) => (
                  <Th key={label}>{label}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {quarters.map((label, i) => (
                  <td
                    key={label}
                    className="px-4 py-3 font-h1 text-[18px] tabular-nums text-on-surface"
                  >
                    {formatMoney(SAMPLE_REVENUE.byQuarter[i] ?? 0, baseCurrency)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </ListPanel>
    </>
  );
}

/** The sample rows, in the same columns as the real table. */
function SamplePlacementRows({ baseCurrency }: { baseCurrency: string }) {
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-left">
        <thead>
          <tr className="border-b border-outline-variant/60">
            <Th>Candidate</Th>
            <Th>Mandate</Th>
            <Th>Client</Th>
            <Th>Status</Th>
            <Th>Start</Th>
            <Th>Guarantee</Th>
            <Th align="right">Fee</Th>
            <Th align="right">Billed</Th>
          </tr>
        </thead>
        <tbody>
          {SAMPLE_PLACEMENTS.map((p) => (
            <tr key={p.id} className="border-b border-outline-variant/30 last:border-0">
              <td className="max-w-0 truncate px-4 py-3 text-body-s text-on-surface">
                {p.candidate}
              </td>
              <td className="max-w-0 truncate px-4 py-3 text-body-s text-on-surface-variant">
                {p.mandate}
              </td>
              <td className="max-w-0 truncate px-4 py-3 text-body-s text-on-surface-variant">
                {p.client}
              </td>
              <td
                className={`px-4 py-3 font-mono-label text-[11px] uppercase tracking-[0.08em] ${
                  p.status === "FELL THROUGH" ? "text-warn" : "text-on-surface-variant"
                }`}
              >
                {p.status}
              </td>
              <td className="px-4 py-3 font-mono-label text-[11px] tracking-[0.08em] text-outline tabular-nums">
                {p.startDate ?? "—"}
              </td>
              <td className="px-4 py-3 font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
                {p.guarantee}
              </td>
              <td className="px-4 py-3 text-right font-mono-label text-mono-label text-on-surface tabular-nums">
                {formatMoney(p.fee, baseCurrency)}
              </td>
              <td
                className={`px-4 py-3 text-right font-mono-label text-mono-label tabular-nums ${
                  p.billed < 0 ? "text-tertiary" : "text-on-surface-variant"
                }`}
              >
                {formatMoney(p.billed, baseCurrency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-4 py-2.5 font-mono-label text-[11px] font-normal uppercase tracking-[0.08em] text-outline ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="bg-surface-container-low px-4 py-4">
      <p className="font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
        {label}
      </p>
      <p className="mt-2 font-h1 text-[26px] leading-none tabular-nums text-on-surface">
        {value}
      </p>
      <p className="mt-2 text-[12px] leading-snug text-on-surface-variant">{hint}</p>
    </div>
  );
}
