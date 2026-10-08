/**
 * What the model calls cost (C11, migration 164).
 *
 * Founder-only, and global — which is why it lives on /ops and not on
 * /app/settings/models. `inference_runs` has no `organization_id`, only
 * `project_id`, so a global figure on an org-facing screen would tell one
 * client's admin how much every other client is spending. With one live
 * org that is theoretical; at client #2 it is a leak. Org-scoped spend is
 * a separate surface for that reason, not an oversight.
 *
 * Both reads go through SECURITY DEFINER functions that RAISE for a
 * non-founder rather than returning empty, so a permissions failure can
 * never render as "£0 spent".
 */

type SpendRow = {
  model: string;
  runs: number;
  priced_runs: number;
  input_tokens: number;
  output_tokens: number;
  est_usd: number;
};

type Policy = {
  window_days: number;
  soft_usd: number;
  hard_usd: number;
  enabled: boolean;
};

function usd(n: number): string {
  // Cents matter at this scale: the product's entire lifetime spend is
  // $4.12, and rounding to dollars would render most of it as $0.
  return `$${n.toFixed(2)}`;
}

function tokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

export function AiSpend({
  rows,
  policy,
  unavailable,
}: {
  rows: SpendRow[];
  policy: Policy | null;
  /** The functions raised — shown as an error, never as zero. */
  unavailable?: string;
}) {
  const spend = rows.reduce((t, r) => t + Number(r.est_usd), 0);
  const runs = rows.reduce((t, r) => t + Number(r.runs), 0);
  const unpriced = rows.reduce(
    (t, r) => t + (Number(r.runs) - Number(r.priced_runs)),
    0
  );

  const hard = policy?.hard_usd ?? null;
  const soft = policy?.soft_usd ?? null;
  const pct = hard && hard > 0 ? Math.min(100, (spend / hard) * 100) : 0;
  const overSoft = soft !== null && spend >= soft;
  const overHard = hard !== null && spend >= hard;

  return (
    <section className="space-y-3">
      <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-tertiary">
        AI spend
        {policy ? ` (last ${policy.window_days} days)` : ""}
      </h2>

      {unavailable ? (
        <p className="border border-outline-variant bg-surface-container px-5 py-4 text-body-main text-on-surface-variant">
          Spend could not be read: {unavailable}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Estimated spend" value={usd(spend)} tone={overHard ? "alert" : overSoft ? "warn" : "plain"} />
            <Tile label="Model calls" value={String(runs)} />
            <Tile
              label="Ceiling"
              value={hard === null ? "—" : usd(hard)}
              hint={policy?.enabled === false ? "disabled" : undefined}
            />
            <Tile
              label="Unpriced calls"
              value={String(unpriced)}
              tone={unpriced > 0 ? "alert" : "plain"}
              hint={unpriced > 0 ? "not counted in spend" : undefined}
            />
          </div>

          {hard !== null && (
            <div className="space-y-1">
              <div
                className="h-1.5 w-full bg-surface-container-highest"
                role="img"
                aria-label={`${usd(spend)} of a ${usd(hard)} ceiling, ${Math.round(pct)} per cent`}
              >
                <div
                  className={
                    overHard
                      ? "h-full bg-error"
                      : overSoft
                        ? "h-full bg-tertiary"
                        : "h-full bg-primary"
                  }
                  style={{ width: `${Math.max(pct, 0.5)}%` }}
                />
              </div>
              <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline tabular-nums">
                {usd(spend)} of {usd(hard)}
                {soft !== null ? ` · warns at ${usd(soft)}` : ""}
                {policy?.enabled === false
                  ? " · budget disabled, nothing is refused"
                  : ""}
              </p>
            </div>
          )}

          {/* The honest caveat, on screen rather than in a comment: an
              unpriced model contributes 0 to the figure above, because
              the cost formula returns NULL without both prices. The
              seam refuses such a model while the budget is enabled, so
              this should stay at zero — if it does not, the number
              above is an understatement. */}
          {unpriced > 0 && (
            <p className="border border-error/40 bg-surface-container px-5 py-3 text-body-main text-on-surface-variant">
              {unpriced} call{unpriced === 1 ? "" : "s"} ran on a model with no
              price in the registry, so they contribute nothing to the figure
              above — the real spend is higher. Set{" "}
              <span className="font-mono-data">price_input_per_mtok</span> and{" "}
              <span className="font-mono-data">price_output_per_mtok</span> from
              the provider&apos;s documentation.
            </p>
          )}

          {rows.length === 0 ? (
            <p className="border border-outline-variant bg-surface-container px-5 py-4 text-body-main text-on-surface-variant">
              No model calls in this window.
            </p>
          ) : (
            <div className="overflow-x-auto border border-outline-variant bg-surface-container">
              <table className="w-full min-w-[34rem] border-collapse text-left">
                <thead>
                  <tr className="border-b border-outline-variant">
                    <Th>Model</Th>
                    <Th numeric>Calls</Th>
                    <Th numeric>Input</Th>
                    <Th numeric>Output</Th>
                    <Th numeric>Est. cost</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {rows.map((r) => {
                    const rowUnpriced = Number(r.runs) - Number(r.priced_runs);
                    return (
                      <tr key={r.model}>
                        <td className="px-4 py-2 font-mono-data text-body-main text-on-surface">
                          {r.model}
                          {rowUnpriced > 0 && (
                            <span className="ml-2 font-mono-label text-mono-label uppercase tracking-wider text-error">
                              {rowUnpriced} unpriced
                            </span>
                          )}
                        </td>
                        <Td>{r.runs}</Td>
                        <Td>{tokens(Number(r.input_tokens))}</Td>
                        <Td>{tokens(Number(r.output_tokens))}</Td>
                        <Td>{usd(Number(r.est_usd))}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Tile({
  label,
  value,
  tone = "plain",
  hint,
}: {
  label: string;
  value: string;
  tone?: "plain" | "warn" | "alert";
  hint?: string;
}) {
  const valueClass =
    tone === "alert"
      ? "mt-1 font-mono-data text-h2 tabular-nums text-error"
      : tone === "warn"
        ? "mt-1 font-mono-data text-h2 tabular-nums text-tertiary"
        : "mt-1 font-mono-data text-h2 tabular-nums text-on-surface";
  return (
    <div className="border border-outline-variant bg-surface-container px-4 py-3">
      <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
        {label}
      </p>
      <p className={valueClass}>{value}</p>
      {hint && (
        <p className="mt-0.5 font-mono-label text-mono-label uppercase tracking-wider text-outline">
          {hint}
        </p>
      )}
    </div>
  );
}

function Th({
  children,
  numeric,
}: {
  children: React.ReactNode;
  numeric?: boolean;
}) {
  return (
    <th
      scope="col"
      className={`px-4 py-2 font-mono-label text-mono-label uppercase tracking-widest text-outline ${
        numeric ? "text-right" : ""
      }`}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-4 py-2 text-right font-mono-data text-body-main tabular-nums text-on-surface-variant">
      {children}
    </td>
  );
}
