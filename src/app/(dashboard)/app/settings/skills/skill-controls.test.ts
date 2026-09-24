import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { can, HUMAN_ROLES, type Role } from "@/lib/auth/roles";

/**
 * §199 — the Skills studio offers no control it cannot honour.
 *
 * The defect: the per-row Pause / Edit / Delete buttons rendered for
 * every reader, while `skills:write` is admin-only and the list is
 * `org:read`. A recruiter clicking Pause got "Toggle failed." — the
 * action threw `ForbiddenError`, `runAction` rethrows that by design,
 * and the authored refusal never reached the toast.
 *
 * The first block is a real behavioural assertion: it pins WHO the gate
 * has to exclude, and it fails if `skills:write` is ever widened without
 * this screen being reconsidered.
 *
 * The second block is a SOURCE-TEXT guard, and says so plainly — it
 * proves the wiring is written, not that a browser renders it (see the
 * standing lesson: a source-text guard only guards source text). What
 * actually makes the row safe is that `canAuthor` is a REQUIRED prop, so
 * tsc refuses a render site that omits it; this only stops the gate
 * being deleted while the prop stays.
 */

const DIR = __dirname;
const row = fs.readFileSync(path.join(DIR, "skill-row.tsx"), "utf8");
const page = fs.readFileSync(path.join(DIR, "page.tsx"), "utf8");

describe("who may author a skill", () => {
  it("is admin only — the roles the row must not offer controls to", () => {
    expect(can("admin", "skills:write")).toBe(true);
    for (const role of ["manager", "recruiter", "researcher", "viewer"] as Role[]) {
      expect(can(role, "skills:write"), `${role} may not author skills`).toBe(
        false
      );
    }
  });

  it("offers nothing to an external or a signed-out reader", () => {
    for (const role of HUMAN_ROLES.filter((r) => r.startsWith("client") || r.startsWith("hiring"))) {
      expect(can(role, "skills:write")).toBe(false);
    }
    expect(can(null, "skills:write")).toBe(false);
    expect(can("agent" as Role, "skills:write")).toBe(false);
  });
});

describe("the row's controls are wired to it (source text)", () => {
  it("takes the capability as a required prop", () => {
    expect(row).toContain("canAuthor: boolean;");
    // No `canAuthor?:` and no default — either would let a render site
    // silently fall back to showing the controls.
    expect(row).not.toMatch(/canAuthor\s*\?\s*:/);
    expect(row).not.toMatch(/canAuthor\s*=\s*(true|false)/);
  });

  it("gates the control cluster on it", () => {
    expect(row).toContain("{canAuthor && (");
    // Every control the action layer would refuse sits after that gate.
    const gate = row.indexOf("{canAuthor && (");
    for (const control of ["handleToggle", "handleDelete", "/app/settings/skills/${skill.id}`"]) {
      expect(row.indexOf(control, gate), `${control} is outside the gate`).toBeGreaterThan(gate);
    }
  });

  it("reads the capability from the same source the gate does", () => {
    expect(page).toContain('hasCapability("skills:write")');
    expect(page).toContain("canAuthor={canAuthor}");
    // Absence would read as broken rather than restricted, so the
    // header explains it where the New Skill button would be.
    expect(page).toContain("Read-only · skills are authored by an admin");
  });
});
