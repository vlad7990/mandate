// Sourcing result import — parsing and dedupe. Pure functions, no I/O, no AI.
//
// Design: docs/superpowers/specs/2026-08-12-sourcing-runs-design.md
//
// The recruiter runs a generated query in a tool they already have a seat for,
// then brings the results back here as pasted rows or a CSV export. Nothing in
// this module fetches anything — it parses what the recruiter supplies and
// decides which rows already describe someone in the pool.
//
// Staged rows are NOT candidates. A human confirms each one first, because
// exported data is messy, frequently duplicates the existing pool, and — for
// someone sourced rather than applied — creates a personal-data record with
// obligations attached.

import {
  identityKey,
  identityStrength,
  type IdentityFields,
} from "@/lib/candidate-identity";

/**
 * Hard ceiling on rows accepted from one import. A pasted 50k-row export would
 * otherwise wedge the action and the review table. Rows beyond the cap are
 * reported, never silently dropped.
 */
export const MAX_IMPORT_ROWS = 2000;

/** Fields the importer understands. Anything else is kept in `raw`. */
export type ImportField =
  | "full_name"
  | "current_title"
  | "current_company"
  | "location"
  | "profile_url"
  | "email";

export type ParsedImportRow = {
  full_name: string;
  current_title: string | null;
  current_company: string | null;
  location: string | null;
  profile_url: string | null;
  email: string | null;
  /** Every column as supplied, for audit and for re-mapping later. */
  raw: Record<string, string>;
};

export type ParseResult = {
  rows: ParsedImportRow[];
  /** Header cells in source order, after normalization. */
  headers: string[];
  /** Which header index fed each known field. */
  mapping: Partial<Record<ImportField, number>>;
  /** Rows present in the input but not returned (over the cap). */
  droppedForCap: number;
  /** Rows skipped because they carried no usable name. */
  skippedUnnamed: number;
};

/**
 * Header aliases across the exports recruiters actually paste. Matching is on
 * a normalized header (lowercased, non-alphanumerics collapsed), so
 * "First Name", "first_name" and "FIRST-NAME" all land together.
 */
const FIELD_ALIASES: Record<ImportField, string[]> = {
  full_name: ["full name", "name", "candidate", "candidate name", "person"],
  current_title: ["title", "current title", "position", "job title", "headline"],
  current_company: ["company", "current company", "employer", "organization"],
  location: ["location", "city", "region", "geography", "area"],
  profile_url: ["profile url", "url", "link", "profile", "public profile url"],
  email: ["email", "email address", "e mail", "work email"],
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Split one delimited line, honouring double quotes and doubled-quote escapes.
 *
 * Hand-rolled rather than pulled in as a dependency because the input is a
 * single already-in-memory paste, and the failure this must avoid is narrow
 * and specific: a quoted company name containing the delimiter
 * (`"Smith, Jones & Co"`) silently shifting every later column.
 */
export function splitDelimitedLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      out.push(field);
      field = "";
      continue;
    }
    field += ch;
  }
  out.push(field);
  return out.map((f) => f.trim());
}

/** Pick the delimiter by which one yields more columns on the header line. */
export function detectDelimiter(headerLine: string): string {
  const candidates = [",", "\t", ";"];
  let best = ",";
  let bestCount = 0;
  for (const d of candidates) {
    const count = splitDelimitedLine(headerLine, d).length;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

function buildMapping(headers: string[]): Partial<Record<ImportField, number>> {
  const mapping: Partial<Record<ImportField, number>> = {};
  const normalized = headers.map(normalizeHeader);

  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as Array<
    [ImportField, string[]]
  >) {
    const idx = normalized.findIndex((h) => aliases.includes(h));
    if (idx >= 0) mapping[field] = idx;
  }

  // "First Name" + "Last Name" is the common export shape and has no single
  // full-name column. Recorded as a synthetic mapping so the caller can see
  // the name was derived rather than read directly.
  if (mapping.full_name === undefined) {
    const first = normalized.findIndex((h) => h === "first name" || h === "first");
    const last = normalized.findIndex((h) => h === "last name" || h === "last");
    if (first >= 0 && last >= 0) {
      mapping.full_name = first;
      (mapping as Record<string, number>).__last_name = last;
    }
  }
  return mapping;
}

function cell(cells: string[], idx: number | undefined): string {
  if (idx === undefined || idx < 0 || idx >= cells.length) return "";
  return cells[idx]?.trim() ?? "";
}

function nullable(v: string): string | null {
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * Parse a pasted block or CSV export into staged rows.
 *
 * The first non-empty line is treated as a header. A row with no usable name is
 * skipped and counted rather than imported as an anonymous record — a staged
 * row exists to be reviewed by a human, and there is nothing to review in a
 * nameless one.
 */
export function parseImport(text: string): ParseResult {
  const lines = text
    .split(/\r\n|\r|\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return {
      rows: [],
      headers: [],
      mapping: {},
      droppedForCap: 0,
      skippedUnnamed: 0,
    };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitDelimitedLine(lines[0], delimiter);
  const mapping = buildMapping(headers);
  const lastNameIdx = (mapping as Record<string, number>).__last_name;

  const body = lines.slice(1);
  const capped = body.slice(0, MAX_IMPORT_ROWS);
  const droppedForCap = body.length - capped.length;

  const rows: ParsedImportRow[] = [];
  let skippedUnnamed = 0;

  for (const line of capped) {
    const cells = splitDelimitedLine(line, delimiter);

    const raw: Record<string, string> = {};
    headers.forEach((h, i) => {
      const v = cells[i]?.trim();
      if (h && v) raw[h] = v;
    });

    let name = cell(cells, mapping.full_name);
    if (lastNameIdx !== undefined) {
      name = `${name} ${cell(cells, lastNameIdx)}`.trim();
    }
    if (!name) {
      skippedUnnamed++;
      continue;
    }

    rows.push({
      full_name: name,
      current_title: nullable(cell(cells, mapping.current_title)),
      current_company: nullable(cell(cells, mapping.current_company)),
      location: nullable(cell(cells, mapping.location)),
      profile_url: nullable(cell(cells, mapping.profile_url)),
      email: nullable(cell(cells, mapping.email)),
      raw,
    });
  }

  return { rows, headers, mapping, droppedForCap, skippedUnnamed };
}

// ---------------------------------------------------------------------------
// Dedupe
// ---------------------------------------------------------------------------

export type MatchStatus = "new" | "duplicate" | "ambiguous";

export type ExistingCandidate = IdentityFields & { id: string };

export type DedupedRow = ParsedImportRow & {
  match_status: MatchStatus;
  matched_candidate_id: string | null;
};

/**
 * Classify each parsed row against the existing pool.
 *
 * - `duplicate` — matched on a STRONG identifier (email or profile URL). Safe
 *   to treat as the same person.
 * - `ambiguous` — matched only on name|company. Same name at a large employer
 *   is a real collision, so the recruiter decides. This is a legitimate
 *   verdict, not a failure to classify.
 * - `new` — no match.
 *
 * Rows are also deduped against EACH OTHER: an export listing the same person
 * twice marks the second occurrence rather than staging two copies.
 */
export function dedupeImportRows(
  rows: readonly ParsedImportRow[],
  existing: readonly ExistingCandidate[]
): DedupedRow[] {
  const byKey = new Map<string, ExistingCandidate>();
  for (const c of existing) {
    const key = identityKey(c);
    if (!byKey.has(key)) byKey.set(key, c);
  }

  const seenInBatch = new Map<string, string | null>();
  const out: DedupedRow[] = [];

  for (const row of rows) {
    const fields: IdentityFields = {
      full_name: row.full_name,
      email: row.email,
      linkedin_url: row.profile_url,
      current_company: row.current_company,
    };
    const key = identityKey(fields);
    const strength = identityStrength(fields);
    const match = byKey.get(key);

    let status: MatchStatus;
    let matchedId: string | null = null;

    if (match) {
      // A name-only match is a heuristic, and the strongest thing we can say
      // is "a human should look at this".
      status = strength === "name" ? "ambiguous" : "duplicate";
      matchedId = match.id;
    } else if (seenInBatch.has(key)) {
      status = strength === "name" ? "ambiguous" : "duplicate";
      matchedId = seenInBatch.get(key) ?? null;
    } else {
      status = "new";
    }

    if (!seenInBatch.has(key)) seenInBatch.set(key, matchedId);
    out.push({ ...row, match_status: status, matched_candidate_id: matchedId });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------

export type RunLink = {
  run_id: string;
  status: "draft" | "executed" | "archived";
  executed_at: string | null;
};

/**
 * First-touch attribution: the earliest EXECUTED run wins.
 *
 * Mirrors `sourcing_candidate_attribution` (migration 041) so client-side
 * display and server-side analytics cannot disagree. Multi-touch is why this
 * exists — crediting one hire to all three runs that surfaced the person
 * inflates every strategy's conversion rate. Draft runs never attribute:
 * nothing was executed, so nothing produced anyone.
 *
 * Ties on `executed_at` break by run_id, matching the view's ORDER BY, so the
 * answer is deterministic rather than dependent on row order.
 */
export function firstTouchRun(links: readonly RunLink[]): string | null {
  const eligible = links.filter(
    (l) => l.status === "executed" && l.executed_at !== null
  );
  if (eligible.length === 0) return null;

  return eligible.reduce((best, l) => {
    if (l.executed_at! < best.executed_at!) return l;
    if (l.executed_at! > best.executed_at!) return best;
    return l.run_id < best.run_id ? l : best;
  }).run_id;
}
