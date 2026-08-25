// The evidence-coverage gap — pure, deterministic, and the reason
// #23 needs no model call to know what it does not know (spec §9:
// "computed by a pure function, not a new artifact").
//
// Reads the RAW evidence fields of cv_structured — roles, domain,
// scale, tech_exposure, transformation_experience, archetype — and
// NEVER the score-shaped fit_dimensions: a pre-screen exists to
// resolve unknowns from evidence, not to launder a score into a
// conversation. Client-safe; the review panel renders the chips and
// the seam feeds the gap to the judgment.

import {
  DIMENSION_KEYS,
  type DimensionKey,
} from "@/lib/ai/onboarding-analysis";

export type CoverageStatus = "strong" | "partial" | "unknown";

export type DimensionCoverage = {
  dimension: DimensionKey;
  status: CoverageStatus;
  /** The evidence found, verbatim from the CV field — null when unknown. */
  evidence: string | null;
  /** Which cv_structured field the evidence came from. */
  source: string | null;
};

const LEADERSHIP_TITLE = /\b(chief|cto|cio|ciso|coo|ceo|vp|vice\s+president|head|director|lead|manager)\b/i;
const SCALE_PEOPLE = /\b(team|org|organisation|organization|people|reports?|engineers?|headcount|\d+)\b/i;
const REGULATORY =
  /\b(regulat\w*|complian\w*|audit\w*|fca|pra|sec|gdpr|basel|mifid|sox|hipaa|iso\s?27001|pci[- ]?dss)\b/i;

type Role = { title?: unknown; company?: unknown; summary?: unknown };

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "")
    : [];
}

export function computeEvidenceCoverage(
  cv: Record<string, unknown> | null | undefined
): DimensionCoverage[] {
  const c = cv ?? {};
  const roles: Role[] = Array.isArray(c.roles) ? (c.roles as Role[]) : [];
  const domain = str(c.domain);
  const scale = str(c.scale);
  const tech = strArray(c.tech_exposure);
  const transformation = strArray(c.transformation_experience);
  const archetype = str(c.archetype);

  const out: DimensionCoverage[] = [];
  for (const dimension of DIMENSION_KEYS) {
    switch (dimension) {
      case "technical": {
        if (tech.length >= 3) {
          out.push({
            dimension,
            status: "strong",
            evidence: tech.slice(0, 5).join(", "),
            source: "tech_exposure",
          });
        } else if (tech.length > 0) {
          out.push({
            dimension,
            status: "partial",
            evidence: tech.join(", "),
            source: "tech_exposure",
          });
        } else {
          out.push({ dimension, status: "unknown", evidence: null, source: null });
        }
        break;
      }
      case "domain": {
        if (domain) {
          out.push({ dimension, status: "strong", evidence: domain, source: "domain" });
        } else {
          out.push({ dimension, status: "unknown", evidence: null, source: null });
        }
        break;
      }
      case "leadership": {
        const led = roles.find((r) => LEADERSHIP_TITLE.test(str(r.title)));
        if (led) {
          out.push({
            dimension,
            status: "strong",
            evidence: str(led.title),
            source: "roles",
          });
        } else if (scale && SCALE_PEOPLE.test(scale)) {
          out.push({ dimension, status: "partial", evidence: scale, source: "scale" });
        } else {
          out.push({ dimension, status: "unknown", evidence: null, source: null });
        }
        break;
      }
      case "regulatory": {
        const direct = [
          ["domain", domain],
          ["scale", scale],
          ["summary", str(c.summary)],
        ].find(([, v]) => v && REGULATORY.test(v));
        if (direct) {
          out.push({
            dimension,
            status: "strong",
            evidence: direct[1],
            source: direct[0],
          });
          break;
        }
        const inRole = roles.find((r) => REGULATORY.test(str(r.summary)));
        if (inRole) {
          out.push({
            dimension,
            status: "partial",
            evidence: str(inRole.summary),
            source: "roles",
          });
        } else {
          out.push({ dimension, status: "unknown", evidence: null, source: null });
        }
        break;
      }
      case "transformation": {
        if (transformation.length > 0) {
          out.push({
            dimension,
            status: "strong",
            evidence: transformation.slice(0, 3).join("; "),
            source: "transformation_experience",
          });
        } else if (archetype === "Transformer") {
          out.push({
            dimension,
            status: "partial",
            evidence: "archetype: Transformer",
            source: "archetype",
          });
        } else {
          out.push({ dimension, status: "unknown", evidence: null, source: null });
        }
        break;
      }
    }
  }
  return out;
}

/** The dimensions a pre-screen should ask about. */
export function unresolvedDimensions(
  coverage: DimensionCoverage[]
): DimensionKey[] {
  return coverage
    .filter((c) => c.status !== "strong")
    .map((c) => c.dimension);
}
