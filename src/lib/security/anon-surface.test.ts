import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * §210 — the anon RPC surface is exactly what we ruled.
 *
 * Postgres grants EXECUTE on a new function to PUBLIC by default, and `anon`
 * inherits PUBLIC. So a function is reachable at /rest/v1/rpc/<name> by
 * anybody holding the publishable key UNLESS a migration revokes it. This
 * codebase answered that 155 times and missed once: `relationship_warmth`
 * (143) was callable anonymously from the day it shipped until §210.
 *
 * ## THE PREMISE ABOVE IS ONLY HALF TRUE, and 164 paid for the other half
 *
 * `anon` does not merely inherit PUBLIC on this database. Supabase's
 * ALTER DEFAULT PRIVILEGES gives `anon` its OWN explicit EXECUTE grant on every
 * new function in `public`, and `REVOKE … FROM PUBLIC` does not touch an
 * explicit role grant. Read from pg_proc.proacl on 2026-10-08, after 164:
 *
 *     ai_budget_verdict → postgres=X  anon=X  authenticated=X  service_role=X
 *
 * 164 wrote `FROM PUBLIC` and nothing else on four functions, which satisfied
 * THIS TEST while leaving `/rest/v1/rpc/ai_budget_verdict` — the platform's
 * global AI spend — open to the publishable key. The advisor sweep caught it;
 * this test did not, because it counted the wrong revoke.
 *
 * So a revoke must now name `anon` to count. That is the house convention
 * already — 134 writes two lines for `claim_evaluation`, `FROM PUBLIC` then
 * `FROM anon` — and of every function created across 165 migrations, the only
 * four that never named `anon` were 164's. 165 fixed those; this guard is why
 * the next one fails the suite instead of the sweep.
 *
 * A `FROM PUBLIC` revoke is still worth writing (it closes the inherited
 * grant, which is what protects a non-Supabase deployment of this schema). It
 * is simply not sufficient on its own here.
 *
 * Nothing was disclosed — it is `LANGUAGE sql IMMUTABLE`, reads no table and
 * takes no id — but nothing prevented the next one either. These two guards
 * make the convention law: the surface cannot grow silently, and it cannot
 * grow deliberately without someone editing the pinned list below.
 *
 * Written for the vulnerability-testing pass: a tester enumerating RPC
 * endpoints should find exactly the set named here and nothing else.
 */

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations");

type Surface = {
  created: Map<string, string>;
  dropped: Set<string>;
  revoked: Set<string>;
  grantedToAnon: Map<string, string>;
};

/**
 * Read every migration in order and fold it into the effective state.
 *
 * Comments are stripped first: a `REVOKE` quoted in a comment is prose, and
 * a guard that counts prose is a guard that passes while the door is open.
 */
function readSurface(): Surface {
  const created = new Map<string, string>();
  const dropped = new Set<string>();
  const revoked = new Set<string>();
  const grantedToAnon = new Map<string, string>();

  const CREATE = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.([a-z_0-9]+)\s*\(/gi;
  const DROP = /DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?public\.([a-z_0-9]+)\s*\(/gi;
  const REVOKE =
    /REVOKE\s+(?:ALL|EXECUTE)\s+ON\s+FUNCTION\s+public\.([a-z_0-9]+)\s*\([^)]*\)\s*\n?\s*FROM\s+([^;]+);/gi;
  const GRANT =
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.([a-z_0-9]+)\s*\([^)]*\)\s*\n?\s*TO\s+([^;]+);/gi;

  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = fs
      .readFileSync(path.join(MIGRATIONS, file), "utf8")
      .split("\n")
      .map((l) => l.split("--")[0])
      .join("\n");

    for (const m of sql.matchAll(CREATE)) {
      created.set(m[1], file);
      dropped.delete(m[1]); // re-created after a drop
    }
    for (const m of sql.matchAll(DROP)) dropped.add(m[1]);
    for (const m of sql.matchAll(REVOKE)) {
      const roles = m[2].toLowerCase();
      // ONLY a revoke naming `anon` counts. See the header: anon holds its own
      // explicit grant here, so `FROM PUBLIC` alone leaves the door open — and
      // a guard that accepts it is a guard that passes while the door is open,
      // which is the same failure its own comment warns about for comments.
      if (/\banon\b/.test(roles)) {
        revoked.add(m[1]);
        // §211 — a revoke FROM anon removes the name from the EFFECTIVE anon
        // set. Before this the model relied on a later non-anon GRANT to do the
        // removal, so a BARE `REVOKE … FROM anon` (no trailing grant) left the
        // name counted — the model, not the surface, was wrong.
        grantedToAnon.delete(m[1]);
      }
    }
    for (const m of sql.matchAll(GRANT)) {
      if (/\banon\b/.test(m[2].toLowerCase())) grantedToAnon.set(m[1], file);
      else if (!/\banon\b/.test(m[2].toLowerCase())) grantedToAnon.delete(m[1]);
    }
  }
  return { created, dropped, revoked, grantedToAnon };
}

const S = readSurface();
const live = (fn: string) => !S.dropped.has(fn);

/**
 * The ruled anon RPC surface, verbatim. Twelve functions, each one a door
 * something outside the product has to be able to knock on.
 *
 * Adding a name here is a security decision. It should be made in a gate,
 * not in a migration nobody re-read.
 */
const RULED_ANON_SURFACE = [
  // The candidate portal's six token doors (073, 098, §207, §209).
  "candidate_portal_context",
  "candidate_portal_list_searches",
  "candidate_portal_record_cv",
  "candidate_portal_request_erasure",
  "candidate_portal_update_contact",
  "candidate_portal_withdraw",
  // §211 — of 110's three "load-bearing" anon grants (limiter/webhook/cron),
  // only the limiter remains: it alone runs BEFORE a session exists. The
  // webhook (record_email_delivery_event) and cron (run_guarantee_maintenance)
  // were SECURITY DEFINER writes whose only real protection was their route's
  // secret; they bypassed that at the data door, so §211 revoked them to
  // service_role and their routes now call them as service_role.
  "check_rate_limit", // the limiter, before a session exists
  // The public apply link (134).
  "submit_application",
  "verify_apply_token",
  // The token verifiers an invited stranger hits before signing in.
  "verify_hm_token",
  "verify_invitation",
  "verify_staff_invitation",
].sort();

describe("§210 — no function reaches anon by Postgres' default", () => {
  it("every live function created in a migration is closed to anon, or is a ruled anon door", () => {
    // THE WHOLE POINT. EXECUTE reaches anon by default twice over — the
    // inherited PUBLIC grant and Supabase's own explicit one — so an omitted
    // REVOKE is a public endpoint. This is the check that was missing when 143
    // shipped, and the `anon` requirement is the half of it that was missing
    // when 164 shipped.
    //
    // Two acceptable states, and no third: the function is revoked FROM anon,
    // or it is deliberately GRANTed TO anon — in which case it must appear in
    // RULED_ANON_SURFACE, which the next test pins exactly. A function that is
    // neither is one nobody decided about.
    const unrevoked = [...S.created.keys()]
      .filter(live)
      .filter((fn) => !S.revoked.has(fn) && !S.grantedToAnon.has(fn))
      .map((fn) => `${fn} (${S.created.get(fn)})`)
      .sort();

    expect(
      unrevoked,
      `these functions are callable at /rest/v1/rpc/<name> by anyone with ` +
        `the publishable key, because nothing revoked the default grant`
    ).toEqual([]);
  });

  it("guards a real population, not an empty list", () => {
    // A filter that silently matched nothing would make the check above pass
    // forever. Bind it to the order of magnitude actually present.
    expect([...S.created.keys()].filter(live).length).toBeGreaterThan(140);
  });
});

describe("§210 — the anon surface is exactly the ruled set", () => {
  it("matches, name for name", () => {
    const granted = [...S.grantedToAnon.keys()].filter(live).sort();
    expect(granted).toEqual(RULED_ANON_SURFACE);
  });

  it("counts a dropped function as gone, not as surface", () => {
    // check_demo_rate_limit was granted to anon in 088 and DROPPED in 089.
    // A scan that ignores drops reports 15 and disagrees with the linter,
    // which is how the roster's count drifted in the first place.
    expect(S.grantedToAnon.has("check_demo_rate_limit")).toBe(true);
    expect(S.dropped.has("check_demo_rate_limit")).toBe(true);
    expect(RULED_ANON_SURFACE).not.toContain("check_demo_rate_limit");
  });

  it("the pinned list is the size the linter reports", () => {
    expect(RULED_ANON_SURFACE.length).toBe(12);
  });

  it("the webhook and cron writes are off the anon surface (§211)", () => {
    // Finding 1+2: these were SECURITY DEFINER writes reachable by anon, with
    // authenticity only at their Next route. §211 revoked them to service_role.
    for (const fn of ["record_email_delivery_event", "run_guarantee_maintenance"]) {
      expect(RULED_ANON_SURFACE).not.toContain(fn);
      expect(S.grantedToAnon.has(fn)).toBe(false);
    }
  });
});

describe("§211 — the open data doors are shut", () => {
  const M159 = fs.readFileSync(
    path.join(MIGRATIONS, "159_close_the_open_data_doors.sql"),
    "utf8"
  );

  it("revokes BOTH functions from anon AND authenticated — not anon only", () => {
    // The crux (D1): Finding 1's PRIMARY vector is an insider (an ordinary
    // authenticated member who can read a provider_message_id). Revoking only
    // anon would leave it open.
    for (const sig of [
      "record_email_delivery_event\\(text, text, text, text\\)",
      "run_guarantee_maintenance\\(\\)",
    ]) {
      expect(M159).toMatch(
        new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${sig}\\s*\\n?\\s*FROM anon, authenticated;`)
      );
    }
  });

  it("keeps service_role, so the routes can still call them", () => {
    for (const sig of [
      "record_email_delivery_event\\(text, text, text, text\\)",
      "run_guarantee_maintenance\\(\\)",
    ]) {
      expect(M159).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${sig}\\s*\\n?\\s*TO service_role;`)
      );
    }
  });

  it("drops the bare anon SELECT on email_suppressions (D6)", () => {
    expect(M159).toMatch(/REVOKE SELECT ON public\.email_suppressions FROM anon;/);
  });

  it("changes no function body — access control only (D3/D4)", () => {
    expect(M159).not.toMatch(/CREATE OR REPLACE FUNCTION/);
  });
});

describe("§211 — the routes call the shut doors as service_role", () => {
  const WEBHOOK = fs.readFileSync(
    path.join(process.cwd(), "src", "app", "api", "webhooks", "resend", "route.ts"),
    "utf8"
  );
  const CRON = fs.readFileSync(
    path.join(process.cwd(), "src", "app", "api", "cron", "maintenance", "route.ts"),
    "utf8"
  );

  it("the webhook calls the RPC through the service-role client, not anon", () => {
    expect(WEBHOOK).toMatch(/getServiceRoleSupabaseClient\(\)/);
    expect(WEBHOOK).toMatch(/\.rpc\("record_email_delivery_event"/);
    // The old anon client is gone — an anon/user client here would re-open it.
    expect(WEBHOOK).not.toMatch(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    expect(WEBHOOK).not.toMatch(/createClient\(/);
  });

  it("the cron calls the RPC through the service-role client, not the user client", () => {
    expect(CRON).toMatch(/getServiceRoleSupabaseClient\(\)/);
    expect(CRON).toMatch(/\.rpc\("run_guarantee_maintenance"\)/);
    // createServerSupabaseClient is the anon/user-context client — must not be
    // what reaches this service_role-only RPC.
    expect(CRON).not.toMatch(/createServerSupabaseClient/);
  });

  it("the webhook REJECTS a bad Svix signature before the write", () => {
    // The authenticity boundary is still the route. Assert the REJECTION, not
    // just the presence of a verify call: a mutation that removed the
    // bad-signature 401 while leaving verifySvix() in place slipped past a
    // presence-ordering check. The literal rejection must exist AND precede
    // the RPC call.
    const reject = WEBHOOK.indexOf('"bad signature"');
    const call = WEBHOOK.indexOf('rpc("record_email_delivery_event"');
    expect(reject, "the bad-signature rejection is gone").toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(reject);
  });
});

describe("§210 — relationship_warmth, the one that got through", () => {
  const M158 = fs.readFileSync(
    path.join(MIGRATIONS, "158_the_anon_surface_is_exactly_what_we_ruled.sql"),
    "utf8"
  );

  it("is revoked from PUBLIC and anon", () => {
    expect(M158).toMatch(
      /REVOKE ALL ON FUNCTION public\.relationship_warmth\(text\) FROM public, anon;/
    );
  });

  it("stays reachable for signed-in callers, so no caller breaks", () => {
    // REVOKE ... FROM public removes what `authenticated` inherited too.
    expect(M158).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.relationship_warmth\(text\)\s*\n?\s*TO authenticated, service_role;/
    );
  });

  it("is not on the anon surface", () => {
    expect(RULED_ANON_SURFACE).not.toContain("relationship_warmth");
    expect(S.revoked.has("relationship_warmth")).toBe(true);
  });
});
