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
    /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.([a-z_0-9]+)\s*\([^)]*\)\s*\n?\s*FROM\s+([^;]+);/gi;
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
      if (/\bpublic\b/.test(roles) || /\banon\b/.test(roles)) revoked.add(m[1]);
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
 * The ruled anon RPC surface, verbatim. Fourteen functions, each one a door
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
  // The three load-bearing ones named in 110's comments.
  "check_rate_limit", //            the limiter, before a session exists
  "record_email_delivery_event", // Resend's webhook
  "run_guarantee_maintenance", //   Vercel Cron
  // The public apply link (134).
  "submit_application",
  "verify_apply_token",
  // The token verifiers an invited stranger hits before signing in.
  "verify_hm_token",
  "verify_invitation",
  "verify_staff_invitation",
].sort();

describe("§210 — no function reaches anon by Postgres' default", () => {
  it("every live function created in a migration is revoked from PUBLIC", () => {
    // THE WHOLE POINT. EXECUTE defaults to PUBLIC, so an omitted REVOKE is a
    // public endpoint. This is the check that was missing when 143 shipped.
    const unrevoked = [...S.created.keys()]
      .filter(live)
      .filter((fn) => !S.revoked.has(fn))
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
    expect(RULED_ANON_SURFACE.length).toBe(14);
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
