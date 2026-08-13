# Continuation — roles and route guards

**Date:** 2026-08-13
**Supersedes:** `2026-08-13-platform-features.md` for section 3 item 2 and
section 2, which are both now decided. Everything else in that doc stands,
including the Resend and `ANTHROPIC_API_KEY` blockers.

Work in `/Users/vladbreygin/Projects/mandate`. Supabase project
`xipyqnltkbtywxqyxupf`. Bash cwd resets to a stale iCloud clone between calls
— always `cd` first or use `git -C`.

Branch `roles-and-route-guards`, commit `498e46f`, **not merged and not
pushed**. Migrations `046`, `047`, `048` are **already applied to the live
database**, so `main` is currently behind the schema it runs against. Merge
or revert deliberately.

442 tests, tsc / lint / build green.

---

## 1. The two decisions the founder made

**Terminal wins.** Sharp corners, uppercase mono labels, `//` separators,
tabular numerals — everywhere, including Portfolio, Candidates and Mandates.
The reasoning was that the marketing site, the OG card and the landing page
already commit to it, so a buyer who converts off that site currently lands
in a softer, more generic product.

**Only the new screens follow it so far.** `/app/settings/members` and
`/app/no-access` are built in it. The ~12 soft pages are untouched — that
re-skin is now a known, scoped piece of work and nothing blocks it.

**Role set: admin, recruiter, researcher, viewer.** Staff only. Hiring
managers and clients stay on the token portal at `/hm/[token]`; they get no
login. That is what kept the role model a column on `users` rather than a
`project_members` graph with per-project RLS on every recruiting table.

---

## 2. What was built

`src/lib/auth/roles.ts` is the source of truth for the matrix.
`supabase/migrations/046` mirrors it in Postgres. They must stay in sync;
both say so at the top.

| | admin | recruiter | researcher | viewer |
|---|---|---|---|---|
| `org:read` | ■ | ■ | ■ | ■ |
| `candidates:write` | ■ | ■ | ■ | □ |
| `mandates:write` | ■ | ■ | □ | □ |
| `clients:share` | ■ | ■ | □ | □ |
| `skills:write` | ■ | □ | □ | □ |
| `org:manage` | ■ | □ | □ | □ |

`is_founder` is deliberately **not** a role. It is the platform-operator
flag — the waitlist and cross-org user administration are Mandate's
concerns, not a customer org's. A founder is an `admin` *and* a founder.

**Three layers, one of which is a boundary.** The proxy decides whether a
route renders; `assertCapability` decides whether a mutation runs; RLS
decides whether Postgres accepts the row. Only the third is a security
boundary — a signed-in user holds their own anon key and can reach PostgREST
from a browser console. The first two exist so the product tells the truth
about itself before the database has to refuse.

**Why the action sweep was cheap.** Twenty action files each carried a
private `requireAuth()` that read the profile and returned
`{userId, organizationId}`. They now delegate to `requireActionContext(cap)`.
That covered 84 exported actions without editing 84 call sites, and it means
the check cannot be omitted from one action in a file where the others have
it. Two actions had no guard at all and were found by audit, not by the
sweep: `regenerateCompanyContextAction` checked only that you were signed in.

---

## 3. Two things the migration fixed that were not asked for

**Suspended users could still write.** No policy anywhere looked at
`status`. A suspended account kept its `organization_id`, so RLS kept
accepting its reads and writes — only the dashboard layout's redirect
stopped it, and a redirect is not a boundary. `current_user_role()` returns
NULL unless the account is active, and every policy requires a non-null role.

**The `cvs` storage bucket was org-scoped only** (migration 047). It is a
bucket, not a table in `public`, so 046 did not touch it — a viewer could
upload a CV, or delete the pool's documents. Found by walking what a
researcher actually does rather than by reading the table list, which is
also how `boolean_queries` turned out to be in the wrong tier: filed under
mandates, a researcher would have reached the sourcing screen and had every
button on it fail at the database.

---

## 4. Verification — what was actually proven

**RLS was tested by impersonation, not by reading policy text.** Under
`SET LOCAL ROLE authenticated` with a forged JWT claim, each of the four
roles attempted real inserts and updates against the live database. Viewer
reads everything and writes nothing; researcher writes candidates and is
refused projects, shortlists and skills; recruiter writes all three and is
refused skills and the org record; admin writes everything.

**All four privilege-escalation vectors are refused** by the trigger in 046:
granting yourself `is_founder`, moving your row to another organisation
(which would make every org-scoped policy follow you there), demoting the
last admin, and suspending the last admin.

**The UI was driven in a browser** with a temporary account, promoted and
demoted through all four roles, then deleted. Row counts before and after
are identical. This closes the previous handoff's "never seen rendered" debt
for the role work specifically — the rail, the no-access page, the members
screen and the guard redirects were all seen working. It does **not** close
it for the fifteen pages `ba2abeb` changed; those still want a look.

One end-to-end path was proven whole: changing a role in the members UI
persisted, revalidated, and immediately bounced the demoted user to
no-access on their next navigation.

---

## 5. Known consequences, deliberate

**New accounts land at `viewer`, not `recruiter`.** The signup trigger wrote
`recruiter` for every non-founder, which was harmless while the column meant
nothing and would now mean an approved stranger arrives able to open
mandates and export to clients. An admin promotes them from
`/app/settings/members`. Approving an account is still founder-only, because
it assigns the organisation.

**A researcher cannot reach `/sourcing` on a mandate whose job spec is not
final.** The sourcing page redirects to `/spec` when there is no final spec,
and `/spec` needs `mandates:write`, so they land on no-access. Correct in
substance — a researcher may not finalize a spec — but the message they get
names the wrong screen. Worth a targeted fix. Neither seeded project has a
final spec, so the happy path could not be exercised.

**`current_user_role()` will keep tripping the Supabase advisor** as a
SECURITY DEFINER function callable by `authenticated`. It has to be: RLS
predicates evaluate as the calling role, so revoking it would make every
read in the product return nothing. Same pattern as `current_user_org_id()`
from 003. `048` explains this next to the one revoke that was safe to make.

The advisor's other warnings are pre-existing and unrelated
(`function_search_path_mutable` on ~24 older functions, leaked-password
protection disabled).

---

## 6. What is next

From the original priority list, unchanged and still in order:

3. **Client entity.** `projects.company_name` is still a text column.
4. **Placement and fee record.** Still no offer date, salary, fee, start
   date, guarantee period or fallthrough.
6. **Link `/app/candidates/search` into the nav.** Still unlinked. Minutes
   of work — it was left alone deliberately, since it is item 6 and this
   session was item 2.
7. **Sample data on the other 37 pages.**

Newly on the list because of this session:

- **Re-skin the ~12 soft pages to terminal.** The decision is made; the work
  is not. Portfolio, Candidates, Mandates and the project tree.
- **Fix the researcher → `/sourcing` → `/spec` bounce message.**
- **`role` on `feedback` submissions is now a constrained vocabulary.** It
  feeds the feedback interpreter as "who is speaking". Worth checking the
  prompt still reads well with `researcher` and `viewer` in it.
