import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The invariants of the network-profile merge (143).
 *
 * Source text, so it proves only what the code SAYS. That the merge is
 * durable, that suppression carries, and that a future CV under the old
 * key rejoins were all proven LIVE through PostgREST — and the naive
 * version was proven to fail live first:
 *
 *   candidate STILL on survivor: false | old-key profile RECREATED: 1
 *
 * These checks exist because each invariant below fails SILENTLY, and two
 * of them fail in the direction of contacting somebody who asked not to be
 * contacted.
 */

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations");
const RAW = fs.readFileSync(
  path.join(MIGRATIONS, "143_network_profile_merge.sql"),
  "utf8"
);
/** Comments stripped before asserting about code — §202's lesson. */
const SQL = RAW.split("\n")
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n");

describe("the resolver consults aliases before it mints a person", () => {
  it("puts the alias lookup BEFORE the find-or-create insert", () => {
    // The whole durability of a merge is this ordering. Reversed, the
    // merge lasts until somebody edits a name.
    const fn = SQL.indexOf("CREATE OR REPLACE FUNCTION public.resolve_network_profile");
    const alias = SQL.indexOf("FROM public.network_profile_aliases", fn);
    const insert = SQL.indexOf("INSERT INTO public.network_profiles", fn);
    expect(alias).toBeGreaterThan(fn);
    expect(insert).toBeGreaterThan(fn);
    expect(alias).toBeLessThan(insert);
  });

  it("returns the alias immediately rather than falling through", () => {
    const fn = SQL.indexOf("CREATE OR REPLACE FUNCTION public.resolve_network_profile");
    const block = SQL.slice(fn, SQL.indexOf("INSERT INTO public.network_profiles", fn));
    expect(block).toMatch(/IF v_id IS NOT NULL THEN\s*RETURN v_id;/);
  });

  it("keeps the unchanged path unchanged — same conflict target, same fallback", () => {
    expect(SQL).toContain("ON CONFLICT (organization_id, identity_key) DO NOTHING");
    expect(SQL).toContain("WHERE organization_id = p_org AND identity_key = v_key");
  });
});

describe("do-not-contact can only be raised by a merge", () => {
  it("opens guard_network_dnc's own door instead of writing behind it", () => {
    // set_network_dnc uses exactly this flag. A merge that instead
    // dropped the trigger, or wrote with the guard disabled, would be a
    // way round the one control that stops unwanted contact.
    expect(SQL).toContain("set_config('mandate.allow_dnc_write', 'on', true)");
    expect(SQL).not.toMatch(/ALTER TABLE public\.network_profiles\s+DISABLE TRIGGER/i);
  });

  it("never writes dnc false, and never clears the reason", () => {
    const fn = SQL.indexOf("CREATE OR REPLACE FUNCTION public.merge_network_profiles");
    const body = SQL.slice(fn);
    // The only assignment to dnc is `true` under v_carried, else the
    // survivor's own value. No branch lowers it.
    expect(body).toContain("dnc         = CASE WHEN v_carried THEN true ELSE p.dnc END");
    expect(body).not.toMatch(/dnc\s*=\s*false/);
    expect(body).not.toMatch(/dnc_reason\s*=\s*NULL/);
  });

  it("carries the ORIGINAL reason, timestamp and setter, not now() and not the merger", () => {
    // The record of WHEN somebody asked not to be contacted is the point
    // of the record; restamping it would erase that.
    expect(SQL).toContain("dnc_set_at  = CASE WHEN v_carried THEN v_dnc_src.dnc_set_at");
    expect(SQL).toContain("dnc_set_by  = CASE WHEN v_carried THEN v_dnc_src.dnc_set_by");
    expect(SQL).not.toMatch(/dnc_set_at\s*=\s*now\(\)/);
  });

  it("puts the survivor in do_not_contact whenever either side is suppressed", () => {
    // The schema CHECK requires this pairing; getting it wrong would
    // abort every merge involving a suppressed person.
    expect(SQL).toMatch(
      /IF v_keep\.dnc OR v_discard\.dnc THEN\s*v_state := 'do_not_contact';/
    );
  });
});

describe("the merge's other refusals and carries", () => {
  it("refuses agents, non-writers, self-merge and anything outside the org", () => {
    expect(SQL).toContain("merging two people is a human act");
    expect(SQL).toContain("public.can_write_candidates()");
    expect(SQL).toContain("a person cannot be merged into themselves");
    // Cross-org is the same refusal as not-found, because a profile in
    // another organisation is a different relationship (§073 D11).
    expect(SQL).toContain("was not found in your organisation");
    expect(SQL).toMatch(/id = p_discard AND organization_id = v_org/);
  });

  it("re-points aliases that already pointed at the discarded person", () => {
    // Merging a merge would otherwise strand the first merge's keys, and
    // those keys are what keep ITS candidates attached.
    expect(SQL).toMatch(
      /UPDATE public\.network_profile_aliases\s*SET profile_id = p_keep\s*WHERE profile_id = p_discard/
    );
  });

  it("records the alias for the discarded key, upserting rather than failing", () => {
    expect(SQL).toContain("INSERT INTO public.network_profile_aliases");
    expect(SQL).toContain("ON CONFLICT (organization_id, identity_key)");
  });

  it("repoints the candidates BEFORE deleting the person they point at", () => {
    // THIS is the load-bearing ordering here. `candidates.network_profile_id`
    // is ON DELETE SET NULL, so deleting the profile first would quietly
    // detach every one of its candidates from any person at all.
    //
    // (The first draft of this file instead asserted the trail entry came
    // before the delete — copied from 142, where `candidate_id` cascades.
    // `activity_events` has no profile column and this event passes only
    // org + detail, so nothing cascades and that ordering protects
    // NOTHING. Mutation testing caught the guard, not the code: a
    // reversed order still passed. A guard that cannot fail is worse than
    // no guard, because it reads like cover.)
    const repoint = SQL.indexOf("UPDATE public.candidates SET network_profile_id = p_keep");
    const del = SQL.indexOf("DELETE FROM public.network_profiles WHERE id = p_discard");
    expect(repoint).toBeGreaterThan(-1);
    expect(del).toBeGreaterThan(-1);
    expect(repoint).toBeLessThan(del);
  });

  it("puts the alias key in the trail, which is what a re-split hunt needs", () => {
    // Anchored on the CALL. The first `'network_profiles_merged'` in this
    // file is the CHECK-constraint list — the third time in three slices
    // that an event name has matched the vocabulary instead of the code.
    const idx = SQL.indexOf("PERFORM public.write_activity_event(");
    expect(idx).toBeGreaterThan(-1);
    const call = SQL.slice(idx, SQL.indexOf("));", idx));
    expect(call).toContain("'network_profiles_merged'");
    expect(call).toContain("'alias_key',       v_discard.identity_key");
    expect(call).toContain("'dnc_carried',     v_carried");
  });

  it("keeps the warmer state rather than the clicked one", () => {
    expect(SQL).toContain("public.relationship_warmth(v_discard.relationship_state)");
    expect(SQL).toContain("> public.relationship_warmth(v_keep.relationship_state)");
  });

  it("fills blank contact fields only, with array_append (142's operator trap)", () => {
    expect(SQL).not.toMatch(/v_filled \|\| '/);
    expect((SQL.match(/array_append\(v_filled/g) ?? []).length).toBe(2);
  });
});

describe("relationship_warmth ranks the temperatures and nothing else", () => {
  it("ranks cold below placed and leaves the two non-temperatures out", () => {
    const fn = SQL.indexOf("FUNCTION public.relationship_warmth");
    const body = SQL.slice(fn, SQL.indexOf("$$;", fn));
    expect(body).toMatch(/'cold'\s+THEN 0/);
    expect(body).toMatch(/'placed'\s+THEN 4/);
    // 'client_contact' is a role and 'do_not_contact' is implied by the
    // dnc flag; both are decided above this function, so neither may be
    // given a temperature here.
    expect(body).not.toContain("client_contact");
    expect(body).not.toContain("do_not_contact");
  });
});
