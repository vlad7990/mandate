import "server-only";
import { getAnthropic } from "@/lib/anthropic";
import {
  SOURCING_SEARCH_SCHEMA,
  SOURCING_SEARCH_SYSTEM_PROMPT,
  SOURCING_SEARCH_PROMPT_VERSION,
  normalizeSourcingSearch,
  type SourcingSearchContent,
} from "./sourcing-search-agent";
import {
  BLOCKED_SOURCE_DOMAINS,
  type SourceConnector,
  resolveAllowedDomains,
} from "@/lib/sourcing/source-policy";

export const SOURCING_SEARCH_MODEL = "claude-sonnet-4-6";
export { SOURCING_SEARCH_PROMPT_VERSION };

/** Search rounds per run. Each round is a billed search; this is the cost ceiling. */
const MAX_SEARCH_USES = 8;

/**
 * How many times we re-send after `pause_turn`. The server-side tool loop
 * pauses at its own iteration limit and expects the conversation re-sent
 * to resume; without this the run returns whatever it had at the pause,
 * which reads as "the agent found almost nothing".
 */
const MAX_CONTINUATIONS = 4;

export type SourcingSearchBrief = {
  role_title: string;
  company_name: string;
  /** Free-text description of who the recruiter is looking for. */
  brief: string;
  /** Optional: seniority, scale, or market constraints. */
  must_haves: string[];
  /** Names already in the pipeline, so the agent does not re-surface them. */
  exclude_names: string[];
};

export type SourcingSearchResult = {
  content: SourcingSearchContent;
  /** The domains actually searched — echoed for the audit trail. */
  searched_domains: string[];
  /** Search rounds the model actually ran. */
  search_rounds: number;
  model_version: string;
  prompt_version: string;
};

type ContentBlock = { type: string; [k: string]: unknown };

/**
 * Run one sourcing search for a role brief against an org's configured
 * sources.
 *
 * Domain scoping is not a nicety — it is the compliance boundary. The
 * tool is given an explicit `allowed_domains`, so the agent physically
 * cannot reach a site the org has not configured, and `blocked_domains`
 * carries the never-automate list on top. That means a prompt-injected
 * "now search LinkedIn" in a fetched page cannot cause a request to
 * LinkedIn: the enforcement is in the tool parameters, not the prompt.
 *
 * Returns null when the org has no usable source configured. That is a
 * deliberate hard stop rather than a fallback to unscoped search, which
 * would both violate the policy above and return directory spam.
 */
export async function runSourcingSearch(
  brief: SourcingSearchBrief,
  connectors: readonly SourceConnector[]
): Promise<SourcingSearchResult | null> {
  const allowedDomains = resolveAllowedDomains(connectors);
  if (!allowedDomains) return null;

  const anthropic = getAnthropic();

  const userPrompt = JSON.stringify(
    {
      role: {
        role_title: brief.role_title,
        company_name: brief.company_name,
        brief: brief.brief,
        must_haves: brief.must_haves,
      },
      already_in_pipeline: brief.exclude_names,
      instruction:
        "Search the available sources for people who plausibly match this brief. Return only leads you can cite. Do not re-surface anyone in already_in_pipeline.",
    },
    null,
    2
  );

  // Whether the server-side web search tool can be combined with
  // structured outputs in ONE call is not something we have been able to
  // confirm against the live API (the account had no credit balance when
  // this was written, so the contract probe never ran). The docs rule out
  // structured outputs alongside document citations and prefill, and say
  // nothing about server tools either way.
  //
  // So: attempt the single call, and if the API rejects the combination,
  // fall back to two calls — search, then structure the transcript. The
  // fallback costs an extra round trip and is otherwise identical in
  // output, so the feature works whichever way the contract turns out.
  // Once verified, delete the losing branch.
  let searchRounds = 0;
  let finalText: string | null = null;

  try {
    const combined = await runToolLoop(anthropic, userPrompt, allowedDomains, true);
    searchRounds = combined.searchRounds;
    finalText = combined.text;
  } catch (err) {
    if (!isFormatToolConflict(err)) throw err;
    const searched = await runToolLoop(anthropic, userPrompt, allowedDomains, false);
    searchRounds = searched.searchRounds;
    finalText = searched.text === null ? null : await structureFindings(anthropic, searched.text);
  }

  // No terminal turn, or nothing to structure — better to report nothing
  // than to present a truncated sweep as a complete one.
  if (finalText === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(finalText);
  } catch {
    return null;
  }

  return {
    content: normalizeSourcingSearch(parsed, allowedDomains),
    searched_domains: allowedDomains,
    search_rounds: searchRounds,
    model_version: SOURCING_SEARCH_MODEL,
    prompt_version: SOURCING_SEARCH_PROMPT_VERSION,
  };
}

/**
 * Drive the web-search tool loop to a terminal turn.
 *
 * `structured` toggles whether this call also asks for JSON. When false the
 * model just reports its findings as prose, and `structureFindings` turns
 * that into the schema in a second, tool-free call.
 */
async function runToolLoop(
  anthropic: ReturnType<typeof getAnthropic>,
  userPrompt: string,
  allowedDomains: string[],
  structured: boolean
): Promise<{ text: string | null; searchRounds: number }> {
  const messages: Array<{ role: "user" | "assistant"; content: unknown }> = [
    { role: "user", content: userPrompt },
  ];
  let searchRounds = 0;

  for (let attempt = 0; attempt <= MAX_CONTINUATIONS; attempt++) {
    const response = await anthropic.messages.create({
      model: SOURCING_SEARCH_MODEL,
      max_tokens: 8000,
      system: SOURCING_SEARCH_SYSTEM_PROMPT,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: messages as any,
      tools: [
        {
          type: "web_search_20260209",
          name: "web_search",
          max_uses: MAX_SEARCH_USES,
          allowed_domains: allowedDomains,
          blocked_domains: [...BLOCKED_SOURCE_DOMAINS],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      ],
      ...(structured
        ? {
            output_config: {
              format: { type: "json_schema", schema: SOURCING_SEARCH_SCHEMA },
            },
          }
        : {}),
    });

    const blocks = response.content as unknown as ContentBlock[];
    searchRounds += countSearchRounds(blocks);

    // The server-side tool loop hit its iteration cap. Re-send the
    // conversation with the assistant turn appended and it resumes — do
    // NOT append a "continue" user message, which corrupts the resume.
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }

    return { text: extractText(blocks), searchRounds };
  }

  return { text: null, searchRounds };
}

/**
 * Second phase of the fallback: turn the search transcript into the
 * schema. No tools — the model may only reshape what phase one found, so
 * it cannot introduce a person or a URL that no search returned.
 */
async function structureFindings(
  anthropic: ReturnType<typeof getAnthropic>,
  findings: string
): Promise<string | null> {
  const response = await anthropic.messages.create({
    model: SOURCING_SEARCH_MODEL,
    max_tokens: 8000,
    system:
      SOURCING_SEARCH_SYSTEM_PROMPT +
      "\n\nYou are now formatting findings you already gathered. Use ONLY the names and URLs present in the input. Do not add a person, and do not add or complete a URL.",
    messages: [{ role: "user", content: findings }],
    output_config: {
      format: { type: "json_schema", schema: SOURCING_SEARCH_SCHEMA },
    },
  });
  return extractText(response.content as unknown as ContentBlock[]);
}

/**
 * Is this the API rejecting structured outputs combined with the search
 * tool, as opposed to any other 400? Matched narrowly: a bad brief or an
 * invalid domain list must still surface as a real error rather than
 * silently costing a second search.
 */
function isFormatToolConflict(err: unknown): boolean {
  const e = err as { status?: number; message?: string } | null;
  if (!e || e.status !== 400) return false;
  const msg = (e.message ?? "").toLowerCase();
  return (
    msg.includes("output_config") ||
    msg.includes("output format") ||
    msg.includes("json_schema") ||
    msg.includes("structured output")
  );
}

/** Last text block of the turn — the structured-output payload. */
function extractText(blocks: readonly ContentBlock[]): string | null {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (b.type === "text" && typeof b.text === "string") return b.text;
  }
  return null;
}

/**
 * Count successful search rounds.
 *
 * A `web_search_tool_result` block's `content` is an ARRAY on success and
 * an OBJECT carrying `error_code` on failure — server-tool errors arrive
 * as a normal 200, never as a thrown exception. Branching on the shape is
 * what keeps a rate-limited search from being counted as a completed one.
 */
function countSearchRounds(blocks: readonly ContentBlock[]): number {
  let n = 0;
  for (const b of blocks) {
    if (b.type !== "web_search_tool_result") continue;
    if (Array.isArray(b.content)) n += 1;
  }
  return n;
}
