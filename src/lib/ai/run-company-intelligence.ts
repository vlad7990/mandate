import "server-only";
import { Webclaw } from "@webclaw/sdk";
import { getAnthropic } from "@/lib/anthropic";
import {
  COMPANY_INTELLIGENCE_SCHEMA,
  COMPANY_INTELLIGENCE_SYSTEM_PROMPT,
  type CompanyIntelligenceReport,
} from "./company-intelligence-agent";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";

const COMPANY_INTELLIGENCE_MODEL = "claude-sonnet-4-6";
const SCRAPE_CHAR_BUDGET = 5000;
const SEARCH_CHAR_BUDGET = 2500;

export type RunCompanyIntelligenceInput = {
  company: {
    name: string;
    /** Optional canonical website. When absent, derived via search. */
    website?: string | null;
  };
  project: {
    role_title: string | null;
    industry: string | null;
    business_model: string | null;
    onboarding: unknown;
    calibration: unknown;
  };
};

export type RunCompanyIntelligenceContext = {
  projectId: string;
  organizationId: string | null;
};

type ScrapeBundle = {
  url: string;
  label: "homepage" | "leadership" | "news" | "careers";
  title: string | null;
  text: string;
};

type SearchBundle = {
  query: string;
  label: "ai_strategy" | "tech_transformation" | "exec_changes" | "recent_news";
  results: Array<{
    title: string;
    url: string;
    snippet: string;
    excerpt: string | null;
  }>;
};

function getWebclaw(): Webclaw {
  // The SDK requires apiKey, but webclaw can run locally without auth.
  // Fall back to a placeholder so dev installs without WEBCLAW_API_KEY
  // still construct the client; the local server will ignore it.
  const apiKey = process.env.WEBCLAW_API_KEY ?? "wc-local";
  const baseUrl = process.env.WEBCLAW_BASE_URL;
  return new Webclaw(baseUrl ? { apiKey, baseUrl } : { apiKey });
}

function truncate(s: string | undefined | null, max: number): string {
  if (!s) return "";
  return s.length <= max ? s : s.slice(0, max) + "\n…[truncated]";
}

/**
 * Pick the first search result whose URL host overlaps the canonical
 * domain. Falls back to the top result when nothing matches — better
 * than scraping a noisy aggregator page.
 */
function pickOnDomainResult(
  results: Array<{ url: string }>,
  canonicalHost: string | null
): string | null {
  if (results.length === 0) return null;
  if (!canonicalHost) return results[0]!.url;
  const hit = results.find((r) => {
    try {
      const h = new URL(r.url).hostname;
      return h === canonicalHost || h.endsWith("." + canonicalHost);
    } catch {
      return false;
    }
  });
  return (hit ?? results[0])!.url;
}

function safeHostname(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Resolve the company's canonical website. Uses the caller-provided
 * URL when present; otherwise asks webclaw for the top organic result
 * for the company name.
 */
async function resolveWebsite(
  client: Webclaw,
  companyName: string,
  hint: string | null | undefined
): Promise<string | null> {
  if (hint && /^https?:\/\//i.test(hint)) return hint;
  try {
    const r = await client.search({
      query: `${companyName} official website`,
      num_results: 5,
    });
    return r.results[0]?.url ?? null;
  } catch {
    return null;
  }
}

/**
 * Find a likely sub-page (leadership / news / careers) for the company.
 * Strategy: site-scoped search, then fall back to plain search if the
 * site-restricted query returns nothing.
 */
async function findSubPage(
  client: Webclaw,
  companyName: string,
  canonicalHost: string | null,
  intent: string
): Promise<string | null> {
  const queries = canonicalHost
    ? [`site:${canonicalHost} ${intent}`, `${companyName} ${intent}`]
    : [`${companyName} ${intent}`];

  for (const query of queries) {
    try {
      const r = await client.search({ query, num_results: 5 });
      const url = pickOnDomainResult(r.results, canonicalHost);
      if (url) return url;
    } catch {
      // Try the next fallback query.
    }
  }
  return null;
}

async function scrapeOne(
  client: Webclaw,
  url: string,
  label: ScrapeBundle["label"]
): Promise<ScrapeBundle | null> {
  try {
    const res = await client.scrape({
      url,
      formats: ["markdown"],
      only_main_content: true,
    });
    return {
      url,
      label,
      title: (res.metadata?.title as string | undefined) ?? null,
      text: truncate(res.markdown, SCRAPE_CHAR_BUDGET),
    };
  } catch {
    return null;
  }
}

async function searchOne(
  client: Webclaw,
  query: string,
  label: SearchBundle["label"]
): Promise<SearchBundle> {
  try {
    const res = await client.search({
      query,
      num_results: 5,
      scrape: true,
      formats: ["markdown"],
    });
    return {
      query,
      label,
      results: res.results.slice(0, 5).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.snippet,
        excerpt: r.markdown
          ? truncate(r.markdown, SEARCH_CHAR_BUDGET)
          : null,
      })),
    };
  } catch {
    return { query, label, results: [] };
  }
}

/**
 * Build the user message Claude sees. Keeps the structure obvious so
 * the model can ground specific claims in specific URLs.
 */
function buildResearchPayload(
  input: RunCompanyIntelligenceInput,
  scrapes: ScrapeBundle[],
  searches: SearchBundle[]
): string {
  return JSON.stringify(
    {
      project_context: {
        company_name: input.company.name,
        role_title: input.project.role_title,
        industry: input.project.industry,
        business_model: input.project.business_model,
        onboarding: input.project.onboarding,
        calibration: input.project.calibration,
      },
      scraped_pages: scrapes.map((s) => ({
        page_type: s.label,
        url: s.url,
        title: s.title,
        markdown: s.text,
      })),
      search_findings: searches.map((s) => ({
        intent: s.label,
        query: s.query,
        results: s.results,
      })),
    },
    null,
    2
  );
}

export async function runCompanyIntelligence(
  input: RunCompanyIntelligenceInput,
  ctx: RunCompanyIntelligenceContext
): Promise<CompanyIntelligenceReport> {
  const client = getWebclaw();
  const companyName = input.company.name;

  // Phase 1 — discover the canonical website.
  const homepageUrl = await resolveWebsite(
    client,
    companyName,
    input.company.website
  );
  const canonicalHost = safeHostname(homepageUrl);

  // Phase 2 — locate leadership / news / careers in parallel.
  const [leadershipUrl, newsUrl, careersUrl] = await Promise.all([
    findSubPage(client, companyName, canonicalHost, "leadership team executives"),
    findSubPage(client, companyName, canonicalHost, "news press"),
    findSubPage(client, companyName, canonicalHost, "careers culture"),
  ]);

  // Phase 3 — scrape the four pages + run the four intelligence
  // searches in parallel. Skip scrapes for pages we couldn't locate.
  const scrapeJobs: Array<Promise<ScrapeBundle | null>> = [];
  if (homepageUrl) scrapeJobs.push(scrapeOne(client, homepageUrl, "homepage"));
  if (leadershipUrl)
    scrapeJobs.push(scrapeOne(client, leadershipUrl, "leadership"));
  if (newsUrl) scrapeJobs.push(scrapeOne(client, newsUrl, "news"));
  if (careersUrl) scrapeJobs.push(scrapeOne(client, careersUrl, "careers"));

  const searchJobs: Array<Promise<SearchBundle>> = [
    searchOne(
      client,
      `${companyName} AI strategy 2025 2026`,
      "ai_strategy"
    ),
    searchOne(
      client,
      `${companyName} technology transformation`,
      "tech_transformation"
    ),
    searchOne(
      client,
      `${companyName} executive leadership changes`,
      "exec_changes"
    ),
    searchOne(client, `${companyName} recent news`, "recent_news"),
  ];

  const [scrapeResults, searchResults] = await Promise.all([
    Promise.all(scrapeJobs),
    Promise.all(searchJobs),
  ]);

  const scrapes = scrapeResults.filter(
    (s): s is ScrapeBundle => s !== null && s.text.length > 0
  );

  // Bail out if research yielded literally nothing — better an honest
  // error than an LLM hallucination off an empty bundle.
  const totalSearchResults = searchResults.reduce(
    (acc, s) => acc + s.results.length,
    0
  );
  if (scrapes.length === 0 && totalSearchResults === 0) {
    throw new Error(
      `Webclaw returned no usable content for "${companyName}". Check WEBCLAW_BASE_URL / WEBCLAW_API_KEY and that the local webclaw server is running.`
    );
  }

  // Phase 4 — synthesise via Claude.
  const userPrompt = buildResearchPayload(input, scrapes, searchResults);
  const system = await applySkillsToPrompt(
    COMPANY_INTELLIGENCE_SYSTEM_PROMPT,
    {
      projectId: ctx.projectId,
      organizationId: ctx.organizationId,
    }
  );

  const anthropic = getAnthropic();
  const response = await anthropic.messages.create({
    model: COMPANY_INTELLIGENCE_MODEL,
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content: userPrompt }],
    output_config: {
      format: {
        type: "json_schema",
        schema: COMPANY_INTELLIGENCE_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(
      "Company-intelligence response contained no text block"
    );
  }

  const partial = JSON.parse(textBlock.text) as Omit<
    CompanyIntelligenceReport,
    "generated_at" | "sources"
  >;

  // Sources are attached server-side from what we actually fetched —
  // never let the LLM invent URLs.
  const sources = Array.from(
    new Set([
      ...scrapes.map((s) => s.url),
      ...searchResults.flatMap((s) => s.results.map((r) => r.url)),
    ])
  );

  return {
    ...partial,
    generated_at: new Date().toISOString(),
    sources,
  };
}
