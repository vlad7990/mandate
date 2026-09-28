import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * §208 D2 + D3 — the half of the ruling that lives on screen.
 *
 * 154 and 155 made suppression a ledger and gave a lift a reach, but the
 * relationship card still showed the single GOVERNING reason and still lifted
 * without showing anybody. Both are rulings, not niceties:
 *
 *  · D3 — a person suppressed twice is a person who said no twice. A card
 *    that shows one of those is §175's class: it asserts the only reason is
 *    the one it happens to have read.
 *  · D2 — a lift is the one operation in the product that can un-suppress
 *    several people at once. It is never performed without the founder having
 *    been shown who, BY NAME.
 *
 * Structural guards, mutation-tested. Drive 142 proved the behaviour live.
 */

const ROOT = process.cwd();
const NETWORK = path.join(ROOT, "src", "app", "(dashboard)", "app", "candidates", "network");

function read(...parts: string[]): string {
  return fs.readFileSync(path.join(...parts), "utf8");
}

const RESOLVER = read(ROOT, "src", "lib", "network", "profile-resolver.ts");
const PAGE = read(NETWORK, "page.tsx");
const TABLE = read(NETWORK, "network-table.tsx");
const CARD = read(NETWORK, "relationship-card.tsx");
const ACTIONS = read(NETWORK, "relationship-actions.ts");

const LEDGER_SQL = fs
  .readFileSync(
    path.join(ROOT, "supabase", "migrations", "154_suppression_becomes_a_ledger.sql"),
    "utf8"
  )
  .split("\n")
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n");

/**
 * The body of a top-level `function name(` / `const name = (` in a TS or TSX
 * file, by brace balance from its opening `{`.
 *
 * Cut at the construct's OWN terminator, never at "the next comment" or "the
 * next export" — a helper that slices to the wrong landmark over-captures the
 * moment a file grows a sibling, and then every assertion inside it passes for
 * the wrong reason.
 */
function body(src: string, declaration: string): string {
  const at = src.indexOf(declaration);
  expect(at, `${declaration} not found`).toBeGreaterThan(-1);
  // The construct's FIRST brace — the arrow's body, the function's body, the
  // object's opening. Anchoring on `=>` instead would run past a declaration
  // that has no arrow and capture the next function in the file.
  const open = src.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  throw new Error(`unbalanced braces after ${declaration}`);
}

describe("§208 — the ledger reaches the screen", () => {
  it("reads the ledger, unlifted rows only", () => {
    const fn = body(RESOLVER, "export async function loadSuppressionLedger(");
    expect(fn).toMatch(/\.from\("network_suppressions"\)/);
    // A lifted row is history. Showing it as a standing reason would say a
    // person is suppressed for something already answered.
    expect(fn).toMatch(/\.is\("lifted_at", null\)/);
  });

  it("orders the rows exactly as the derivation orders them", () => {
    const fn = body(RESOLVER, "export async function loadSuppressionLedger(");
    // The card calls suppressions[0] the row that governs the badge. That is
    // only true if this ordering is the SQL's ordering — two orderings of one
    // fact on one screen is the defect D3 exists to prevent.
    expect(fn).toMatch(/\.order\("set_at", \{ ascending: true \}\)/);
    expect(fn).toMatch(/\.order\("id", \{ ascending: true \}\)/);
    const refresh = LEDGER_SQL.slice(
      LEDGER_SQL.indexOf("FUNCTION public.refresh_network_suppression(")
    );
    expect(refresh).toMatch(/ORDER BY s\.set_at ASC, s\.id ASC/);
  });

  it("names the FK, because set_by and lifted_by both point at users", () => {
    const fn = body(RESOLVER, "export async function loadSuppressionLedger(");
    // A bare `users(...)` embed over two FKs answers PGRST201 / HTTP 300, not
    // rows — and the page would render every suppression with no setter.
    expect(fn).toMatch(/users!network_suppressions_set_by_fkey\(full_name\)/);
    expect(fn).not.toMatch(/setter:users\(/);
  });

  it("loads it for the people on the page, and hands it to the table", () => {
    expect(PAGE).toMatch(
      /loadSuppressionLedger\(page\.people\.map\(\(p\) => p\.profile_id\)\)/
    );
    expect(PAGE).toMatch(/suppressions=\{suppressions\}/);
    expect(TABLE).toMatch(/suppressions=\{suppressions\[p\.profile_id\] \?\? \[\]\}/);
    expect(TABLE).toMatch(/suppressions=\{suppressions\}/);
  });
});

describe("§208 D3 — the card lists every reason, with its source", () => {
  it("renders the whole list, not the governing row", () => {
    expect(CARD).toMatch(/suppressions\.map\(\(s, i\) =>/);
    expect(CARD).toMatch(/\{s\.reason\}/);
    expect(CARD).toMatch(/SOURCE_LABEL\[s\.source\]/);
    expect(CARD).toMatch(/\{s\.set_at\.slice\(0, 10\)\}/);
  });

  it("has a label for each of the four sources the ledger allows", () => {
    const check = LEDGER_SQL.match(/source\s+text NOT NULL CHECK \(source IN \(([^)]*)\)\)/);
    expect(check, "the ledger's source CHECK moved").not.toBeNull();
    const sources = Array.from(check![1].matchAll(/'([a-z]+)'/g)).map((m) => m[1]);
    expect(sources.length).toBe(4);
    const labels = body(CARD, "const SOURCE_LABEL:");
    for (const source of sources) {
      expect(labels, `no reader's words for source '${source}'`).toMatch(
        new RegExp(`${source}:\\s*"[^"]{4,}"`)
      );
    }
  });

  it("marks which row governs the badge above it", () => {
    expect(CARD).toMatch(/\{i === 0 && <span>· governs the badge<\/span>\}/);
  });

  it("does not claim there are no reasons when it read none", () => {
    // dnc is DERIVED from the ledger, so an empty list on a suppressed person
    // means UNREAD, not absent. The fall-back says what the derived columns
    // say and stops there (§175).
    expect(CARD).toMatch(/suppressions\.length === 0 \? \(/);
    expect(CARD).toMatch(/\{profile\.dnc_reason \?\? "No reason recorded\."\}/);
  });

  it("says a lift leaves the other reasons standing", () => {
    expect(CARD).toMatch(
      /Lifting one leaves this person suppressed while any other stands/
    );
  });
});

describe("§208 D2 — a lift is never silent", () => {
  const REVIEW = body(CARD, "const review = (");
  const CONFIRM = body(CARD, "const confirmLift = () =>");

  it("reads the reach before anything is lifted, and writes nothing", () => {
    expect(REVIEW).toMatch(/suppressionReachAction\(ids\)/);
    expect(REVIEW).toMatch(/setLift\(\{/);
    // The review step is a READ. If it could lift, the confirmation would be
    // decoration over an act that already happened.
    expect(REVIEW).not.toMatch(/liftSuppressionAction|clearDncAction/);
  });

  it("only the confirmed act lifts, and only what was shown", () => {
    expect(CONFIRM).toMatch(/clearDncAction\(profile\.id, words\)/);
    expect(CONFIRM).toMatch(/liftSuppressionAction\(id, words\)/);
    expect(CONFIRM).toMatch(/for \(const id of ids\)/);
  });

  it("no button lifts directly — every path goes through the review", () => {
    // The construct, not the vocabulary: an onClick that calls either lifting
    // action is a silent lift however it is spelled.
    const handlers = Array.from(CARD.matchAll(/onClick=\{([\s\S]*?)\}\n/g)).map(
      (m) => m[1]
    );
    for (const handler of handlers) {
      expect(handler).not.toMatch(/liftSuppressionAction|clearDncAction/);
    }
    expect(CARD).toMatch(/onClick=\{\(\) => review\(`lift:\$\{s\.id\}`, \[s\.id\], false\)\}/);
    expect(CARD).toMatch(/review\(\s*"clear",\s*suppressions\.map\(\(s\) => s\.id\),\s*true\s*\)/);
    expect(CARD).toMatch(/onClick=\{confirmLift\}/);
  });

  it("the confirmation names the people, and does not merely count them", () => {
    const panel = CARD.slice(CARD.indexOf("{lift && ("));
    expect(panel).toMatch(/lift\.reached\.map\(\(r\) =>/);
    expect(panel).toMatch(/\{r\.displayName\}/);
    expect(panel).toMatch(/This also lifts \$\{lift\.reached\.length - 1\}/);
    // The reason that will be recorded is shown with the names it applies to.
    expect(panel).toMatch(/\{lift\.reason\}/);
  });

  it("offers no lift at all when the reach cannot be named", () => {
    expect(CARD).toMatch(
      /suppressions\.length > 0 \? \([\s\S]*?review\(\s*"clear"/
    );
    expect(CARD).toMatch(/who a lift reaches cannot be\s*\n?\s*shown/);
  });
});

describe("§208 — the actions behind it", () => {
  it("the reach action reads and does not revalidate", () => {
    const fn = body(ACTIONS, "export async function suppressionReachAction(");
    expect(fn).toMatch(/\.rpc\("network_suppression_reach", \{\s*\n?\s*p_suppression: id,/);
    expect(fn).not.toMatch(/revalidatePath/);
    expect(fn).not.toMatch(/lift_network_suppression|clear_network_dnc/);
  });

  it("the reach union names a shared descendant once", () => {
    const fn = body(ACTIONS, "export async function suppressionReachAction(");
    // Clearing a person asks about every reason they hold; two of those can
    // have carried to the same third person.
    expect(fn).toMatch(/byRow\.set\(row\.suppression_id,/);
    expect(fn).toMatch(/isOrigin: \(seen\?\.isOrigin \?\? false\) \|\| row\.is_origin/);
  });

  it("the lift action lifts a SUPPRESSION, not a person", () => {
    const fn = body(ACTIONS, "export async function liftSuppressionAction(");
    expect(fn).toMatch(/\.rpc\("lift_network_suppression", \{/);
    expect(fn).toMatch(/p_suppression: suppressionId,/);
    expect(fn).toMatch(/p_reason: reason,/);
    // Passing a profile id here would be a different act with the same shape.
    expect(fn).not.toMatch(/p_profile_id/);
    expect(fn).toMatch(/revalidatePath\("\/app\/candidates\/network"\)/);
  });

  it("every action still proves the caller is provisioned", () => {
    for (const fn of ["suppressionReachAction", "liftSuppressionAction"]) {
      expect(body(ACTIONS, `export async function ${fn}(`)).toMatch(
        /await requireAuth\(\);/
      );
    }
  });
});
