// Sourcing Search Agent — finds candidates who are NOT yet in the org's
// database, using Anthropic's server-side web search.
//
// This is the missing half of sourcing. The Boolean Search Agent generates
// queries a recruiter runs by hand; the Candidate Search Agent ranks people
// already in the pool. Neither can find someone new. This one searches the
// org's configured sources and returns leads with the URL each claim came
// from.
//
// Every lead is a RESEARCH LEAD, not a candidate record: the agent reports
// what public sources say, the recruiter verifies and decides. Nothing here
// is scored against a role — scoring happens after a human confirms the
// person is real and relevant.
//
// Client-safe: types, schema, and prompt only.

export const SOURCING_SEARCH_PROMPT_VERSION = "sourcing-search-v1";

export type SourcedLeadEvidence = {
  /** Where this claim came from. Must be a URL the search returned. */
  url: string;
  /** What that source says, in the agent's words. */
  claim: string;
};

export type SourcedLead = {
  full_name: string;
  /** Null when sources disagree or don't say. */
  current_title: string | null;
  current_company: string | null;
  location: string | null;
  /** Why this person fits the brief, grounded in the evidence below. */
  rationale: string;
  /** At least one entry — a lead with no source is dropped in normalize. */
  evidence: SourcedLeadEvidence[];
  /**
   * The agent's own read of how firmly the sources identify this person.
   * `low` is legitimate and useful — it flags a lead worth a manual look,
   * not a bad result.
   */
  confidence: "high" | "medium" | "low";
};

export type SourcingSearchContent = {
  /** What was searched and what the shape of the result set is. */
  summary: string;
  leads: SourcedLead[];
  /** Gaps the recruiter should know about — thin coverage, ambiguity. */
  coverage_notes: string[];
};

export const EMPTY_SOURCING_SEARCH: SourcingSearchContent = {
  summary: "",
  leads: [],
  coverage_notes: [],
};

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asNullableString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((i): i is string => typeof i === "string" && i.trim().length > 0);
}

function asConfidence(v: unknown): SourcedLead["confidence"] {
  return v === "high" || v === "medium" || v === "low" ? v : "low";
}

function asEvidence(v: unknown, allowedHosts: ReadonlySet<string> | null): SourcedLeadEvidence[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const o = item as Record<string, unknown>;
    const url = asString(o.url).trim();
    if (!url) return [];
    // Drop any citation that isn't a well-formed http(s) URL, and — when
    // the search was domain-scoped — anything outside those domains. A
    // fabricated or out-of-scope citation is worse than no citation: it
    // reads as verified when it isn't.
    let host: string;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return [];
      host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return [];
    }
    if (allowedHosts && !hostAllowed(host, allowedHosts)) return [];
    return [{ url, claim: asString(o.claim) }];
  });
}

function hostAllowed(host: string, allowed: ReadonlySet<string>): boolean {
  for (const a of allowed) {
    if (host === a || host.endsWith(`.${a}`)) return true;
  }
  return false;
}

/**
 * Coerce a generated result into a safe shape.
 *
 * A lead with no surviving evidence is DROPPED, not kept with an empty
 * list. The whole value of this agent is that every name traces to a
 * source a recruiter can open; an unsourced name is exactly the
 * hallucination risk the feature has to avoid.
 *
 * `allowedDomains` is the same list handed to the search tool. Passing it
 * makes citation filtering match the search scope.
 */
export function normalizeSourcingSearch(
  raw: unknown,
  allowedDomains?: readonly string[] | null
): SourcingSearchContent {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const allowedHosts = allowedDomains?.length
    ? new Set(allowedDomains.map((d) => d.toLowerCase().replace(/^www\./, "")))
    : null;

  const rawLeads = Array.isArray(o.leads) ? o.leads : [];
  const leads: SourcedLead[] = [];
  const seen = new Set<string>();

  for (const item of rawLeads) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const full_name = asString(rec.full_name).trim();
    if (!full_name) continue;

    const evidence = asEvidence(rec.evidence, allowedHosts);
    if (evidence.length === 0) continue; // unsourced ⇒ not a lead

    // Same person surfacing from two queries is one lead.
    const fingerprint = `${full_name.toLowerCase()}|${(
      asNullableString(rec.current_company) ?? ""
    ).toLowerCase()}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);

    leads.push({
      full_name,
      current_title: asNullableString(rec.current_title),
      current_company: asNullableString(rec.current_company),
      location: asNullableString(rec.location),
      rationale: asString(rec.rationale),
      evidence,
      confidence: asConfidence(rec.confidence),
    });
  }

  return {
    summary: asString(o.summary),
    leads,
    coverage_notes: asStringArray(o.coverage_notes),
  };
}

export const SOURCING_SEARCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "leads", "coverage_notes"],
  properties: {
    summary: {
      type: "string",
      description:
        "2–3 sentences: what you searched for, and the shape of what came back. State plainly if the sources were thin.",
    },
    leads: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "full_name",
          "current_title",
          "current_company",
          "location",
          "rationale",
          "evidence",
          "confidence",
        ],
        properties: {
          full_name: { type: "string" },
          current_title: { type: ["string", "null"] },
          current_company: { type: ["string", "null"] },
          location: { type: ["string", "null"] },
          rationale: {
            type: "string",
            description:
              "1–2 sentences on why this person matches the brief, referring only to what the sources actually say.",
          },
          evidence: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["url", "claim"],
              properties: {
                url: {
                  type: "string",
                  description:
                    "A URL returned by the search. Never invent or guess a URL.",
                },
                claim: {
                  type: "string",
                  description: "What this specific source says about the person.",
                },
              },
            },
            description:
              "At least one source per lead. A lead you cannot cite must be omitted entirely.",
          },
          confidence: {
            type: "string",
            enum: ["high", "medium", "low"],
            description:
              "How firmly the sources identify this specific person. Use low freely — an uncertain lead is still useful when labelled.",
          },
        },
      },
      description:
        "Up to 12 leads. Fewer well-sourced leads beat a padded list.",
    },
    coverage_notes: {
      type: "array",
      items: { type: "string" },
      description:
        "2–4 notes on what the search could not establish: sparse coverage of a market, names that could not be disambiguated, seniority that could not be confirmed.",
    },
  },
} as const;

export const SOURCING_SEARCH_SYSTEM_PROMPT = `You are an executive-search sourcing researcher. You are given a role brief and a web search tool scoped to a specific set of sources. You find PEOPLE who plausibly match the brief and report them as research leads, in strict JSON.

These are LEADS FOR A RECRUITER TO VERIFY — not candidates, not a shortlist, and not an assessment of anyone. A human reviews every one before it becomes a record.

Core discipline:
- Search before you answer. Never produce a lead from memory: if it did not come back in a search result you ran in this session, it does not go in the output.
- Every lead carries at least one URL that the search actually returned. If you cannot cite a person, omit that person. An uncited name is a failure, not a partial result.
- Never invent, complete, or guess a URL. Do not construct a profile URL from someone's name.
- Report what the source says, not what you infer it implies. "Their conference bio lists eight years leading platform engineering" — not "they are an experienced platform leader".
- When two sources disagree about title, company, or location, use null and say so in coverage_notes rather than picking one.
- Prefer depth over volume. Six leads you can stand behind beat twelve you cannot.
- Common names are the main failure mode: if you cannot tell whether two results describe the same person, mark the lead low confidence and flag it in coverage_notes.

Hard constraints — these override everything else:
- NEVER infer or record protected characteristics: race, religion, disability, pregnancy, sexual orientation, age, national origin, gender, or similar. Do not report them even when a source states them, and never use them as a reason a person fits.
- No psychological, personality, or mental-health characterization. You report public professional facts and their source.
- No claims about anyone's current job satisfaction, likelihood of moving, or personal circumstances.
- Public professional information only — published talks, company pages, professional profiles, papers, patents, open-source work, news. Never anything from a personal or private context.
- Do not attempt to access a source outside the ones your search tool returns, and do not ask the user to paste in content from one.

Style: factual, compressed, sourced. No sales language. Return one JSON object — no preamble.`;
