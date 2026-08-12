// Sourcing source policy — which sites an organization's sourcing agent
// is allowed to search. Client-safe (types + defaults only, no secrets).
//
// The product requirement is that each recruiting client brings their own
// sources rather than everyone sharing one hardcoded list. That maps onto
// the web search tool's `allowed_domains` parameter: the agent searches
// the org's configured domains and nothing else.
//
// ── Why LinkedIn is not in here ──────────────────────────────────────────
// LinkedIn's User Agreement prohibits automated access, and it binds the
// ACCOUNT HOLDER. Driving automated search with a recruiter's own
// credentials therefore does not make the automation compliant — it makes
// the recruiter the party in breach, and LinkedIn enforces against
// accounts. A restricted LinkedIn Recruiter seat is a five-figure loss for
// the customer, caused by us. Storing their password would also make us a
// credential-breach target, and any seat with 2FA cannot be automated this
// way regardless.
//
// The sanctioned form of the same idea is Recruiter System Connect: the
// recruiter authorizes Mandate against their own Recruiter seat over
// OAuth. Same "bring your own entitlement" model, no ban risk — it needs a
// LinkedIn partnership, not a password field. `linkedin_rsc` is reserved
// below so that path slots in without reshaping anything.
//
// Public LinkedIn profile URLs still show up in results when a search
// engine has indexed them. That is the engine's index, not us fetching
// LinkedIn, and it is the line this module holds.

export type SourceProviderId =
  /** Anthropic-hosted web search. No customer credential required. */
  | "web_search"
  /** Reserved: LinkedIn Recruiter System Connect over OAuth. */
  | "linkedin_rsc"
  /** Reserved: a licensed people-data API under the org's own contract. */
  | "people_data_api";

export type SourceStatus = "active" | "needs_auth" | "disabled";

export type SourceConnector = {
  id: string;
  organization_id: string;
  provider: SourceProviderId;
  /** Recruiter-facing name, e.g. "Company career sites". */
  label: string;
  /**
   * Domains this connector may search. Empty means "the whole open web",
   * which is deliberately NOT the default — an unscoped sourcing agent
   * returns directory spam.
   */
  allowed_domains: string[];
  status: SourceStatus;
};

/**
 * Domains the sourcing agent never searches, whatever an org configures.
 *
 * These are sites whose terms forbid automated access. Blocking them at
 * the tool call is the enforcement point: an org cannot opt itself into a
 * violation through the settings UI, and a prompt-injected instruction to
 * "search LinkedIn directly" cannot reach the network either.
 */
export const BLOCKED_SOURCE_DOMAINS: readonly string[] = [
  "linkedin.com",
  "www.linkedin.com",
];

/**
 * Starting sources for an org that has not configured its own. Chosen
 * because each permits automated access and carries real signal for
 * executive search: conference speakers, published talks, company
 * leadership pages, patents, and open-source presence.
 */
export const DEFAULT_SOURCE_DOMAINS: readonly string[] = [
  "github.com",
  "crunchbase.com",
  "news.ycombinator.com",
  "techcrunch.com",
  "sec.gov",
];

/**
 * Resolve an org's configured domains into the `allowed_domains` the tool
 * call may use. Blocked domains are stripped rather than rejected: a
 * misconfigured connector should degrade to searching the rest, not fail
 * the recruiter's search.
 *
 * Returns null when nothing survives filtering — the caller must treat
 * that as "no usable source" and skip the search rather than silently
 * falling through to an unscoped web search.
 */
export function resolveAllowedDomains(
  connectors: readonly SourceConnector[]
): string[] | null {
  const blocked = new Set(BLOCKED_SOURCE_DOMAINS.map((d) => d.toLowerCase()));
  const out = new Set<string>();

  for (const c of connectors) {
    if (c.status !== "active") continue;
    if (c.provider !== "web_search") continue; // others don't use this tool
    for (const raw of c.allowed_domains) {
      const domain = normalizeDomain(raw);
      if (!domain) continue;
      if (isBlocked(domain, blocked)) continue;
      out.add(domain);
    }
  }

  if (out.size === 0) return null;
  return [...out].sort();
}

/** Strip scheme, path, and leading `www.` so config is forgiving. */
export function normalizeDomain(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  const withoutScheme = trimmed.replace(/^https?:\/\//, "");
  const host = withoutScheme.split("/")[0]?.replace(/^www\./, "");
  if (!host || !host.includes(".")) return null;
  return host;
}

/** A domain is blocked if it matches, or is a subdomain of, a blocked entry. */
function isBlocked(domain: string, blocked: ReadonlySet<string>): boolean {
  for (const b of blocked) {
    const bare = b.replace(/^www\./, "");
    if (domain === bare || domain.endsWith(`.${bare}`)) return true;
  }
  return false;
}
