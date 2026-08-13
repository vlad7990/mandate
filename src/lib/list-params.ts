// URL state for paginated list screens.
//
// Every list page keeps its state in the query string rather than in
// component state: a filtered page is then a link a recruiter can bookmark,
// send to a colleague, or return to with the back button, and the page can
// stay a server component and fetch only the rows it renders.
//
// The allowlists are the load-bearing part. A sort key reaches
// PostgREST's `.order()` and a filter key reaches `.eq()`, both as column
// names — so anything arriving from the query string is matched against a
// list the page declares, and unrecognised values are dropped rather than
// passed through. Clamping the page number does the same job for `.range()`.

export type SortDirection = "asc" | "desc";

export type ListParams = {
  /** 1-based, clamped to at least 1. */
  page: number;
  perPage: number;
  /** Free-text search, trimmed. Empty string means no search. */
  q: string;
  /** Only keys the caller allowed, only non-empty values. */
  filters: Record<string, string>;
  /** Null when unset or not allowed. Safe to pass to `.order()`. */
  sort: string | null;
  dir: SortDirection;
};

export type ListParamsSpec = {
  /** Rows per page. Clamped to 1–200. */
  perPage?: number;
  /** Filter keys this page understands. Anything else is ignored. */
  filters?: readonly string[];
  /** Sortable columns. Anything else is ignored. */
  sorts?: readonly string[];
  defaultSort?: string;
  defaultDir?: SortDirection;
};

/** What Next hands a page, once awaited. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

const DEFAULT_PER_PAGE = 25;
const MAX_PER_PAGE = 200;

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/**
 * A positive integer, or the fallback. Rejects NaN, zero, negatives, floats
 * and the `?page=1e9` form — all of which otherwise reach `.range()`.
 */
function positiveInt(raw: string, fallback: number): number {
  if (!/^\d+$/.test(raw)) return fallback;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 1) return fallback;
  return n;
}

export function parseListParams(
  searchParams: RawSearchParams,
  spec: ListParamsSpec = {}
): ListParams {
  const perPage = Math.min(
    Math.max(spec.perPage ?? DEFAULT_PER_PAGE, 1),
    MAX_PER_PAGE
  );

  const filters: Record<string, string> = {};
  for (const key of spec.filters ?? []) {
    const value = first(searchParams[key]).trim();
    if (value.length > 0) filters[key] = value;
  }

  const requestedSort = first(searchParams.sort).trim();
  const sort =
    requestedSort && (spec.sorts ?? []).includes(requestedSort)
      ? requestedSort
      : (spec.defaultSort ?? null);

  const requestedDir = first(searchParams.dir).trim();
  const dir: SortDirection =
    requestedDir === "asc" || requestedDir === "desc"
      ? requestedDir
      : (spec.defaultDir ?? "desc");

  return {
    page: positiveInt(first(searchParams.page), 1),
    perPage,
    q: first(searchParams.q).trim(),
    filters,
    sort,
    dir,
  };
}

/**
 * Inclusive bounds for PostgREST's `.range(from, to)`.
 *
 * Note this asks for one row beyond the page. Callers use the extra row to
 * tell "there is a next page" from "this is the last one" without a second
 * count query — see `splitOverfetch`.
 */
export function rangeFor(params: ListParams): { from: number; to: number } {
  const from = (params.page - 1) * params.perPage;
  return { from, to: from + params.perPage };
}

/**
 * Trim the overfetched row back off, reporting whether it was there.
 *
 * An exact count costs a second aggregate over the same predicate on every
 * page view. Asking for one extra row answers the only question the control
 * actually needs — is the Next button live — for free.
 */
export function splitOverfetch<T>(
  rows: readonly T[],
  params: ListParams
): { rows: T[]; hasMore: boolean } {
  const hasMore = rows.length > params.perPage;
  return { rows: rows.slice(0, params.perPage), hasMore };
}

/** Total pages for a known total. Always at least 1, so "Page 1 of 1" holds. */
export function pageCount(total: number, perPage: number): number {
  if (total <= 0 || perPage <= 0) return 1;
  return Math.ceil(total / perPage);
}

/** The 1-based row numbers this page covers, for "Showing 26–50 of 340". */
export function pageRange(
  params: ListParams,
  rowsOnPage: number
): { first: number; last: number } {
  if (rowsOnPage <= 0) return { first: 0, last: 0 };
  const first = (params.page - 1) * params.perPage + 1;
  return { first, last: first + rowsOnPage - 1 };
}

/**
 * A link to the same list with some values changed.
 *
 * Any change other than the page itself returns to page one — a recruiter
 * who searches while on page 4 of the unfiltered list should not land on an
 * empty page 4 of the filtered one.
 */
export function buildListHref(
  basePath: string,
  params: ListParams,
  overrides: Partial<{
    page: number;
    q: string;
    sort: string | null;
    dir: SortDirection;
    filters: Record<string, string>;
  }> = {}
): string {
  const next = { ...params, ...overrides };
  const changedBeyondPage =
    overrides.q !== undefined ||
    overrides.sort !== undefined ||
    overrides.dir !== undefined ||
    overrides.filters !== undefined;
  const page = overrides.page ?? (changedBeyondPage ? 1 : params.page);

  const search = new URLSearchParams();
  if (next.q) search.set("q", next.q);
  for (const [key, value] of Object.entries(next.filters)) {
    if (value) search.set(key, value);
  }
  if (next.sort) {
    search.set("sort", next.sort);
    search.set("dir", next.dir);
  }
  if (page > 1) search.set("page", String(page));

  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** True when anything is narrowing the list — drives the "Clear" affordance. */
export function isFiltered(params: ListParams): boolean {
  return params.q.length > 0 || Object.keys(params.filters).length > 0;
}
