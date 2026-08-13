# Continuation — back to platform features

**Date:** 2026-08-13
**Supersedes:** `2026-08-13-art14-notification-sending.md` for everything
except the Resend blocker, which is unchanged and still founder-owned.

Work in `/Users/vladbreygin/Projects/mandate`. Supabase project
`xipyqnltkbtywxqyxupf`. Bash cwd resets to a stale iCloud clone between calls
— always `cd` first or use `git -C`.

`main` is clean, pushed, and deployed to `getmandate.io`. 389 tests, tsc /
lint / build green. Last commit `ba2abeb`. Latest migration `045`, applied.

---

## 1. What the last session did

**Six commits, three of them PDF correctness.** The comparison PDF had never
been rendered and looked at; doing so found four defects, three present in
every export at every pool size. Then the same treatment for the evaluation
and weekly-report PDFs. `b142e9f`, `ebd59d9`, `bdb1198`, `01e6f0e`.

The lesson worth carrying: **react-pdf fails silently.** A column narrower
than its own heading overprints its neighbour; a character outside WinAnsi is
emitted as whatever byte sits at that position. Neither errors. Anything new
reaching a PDF wants a look at rendered output, not just the JSX.

**Then a review of the recruiting persona** (Portfolio, Analytics, Mandates,
Candidates, Network, Executive Intelligence, Competencies, Role templates,
Skills studio), and the first two items off it — `ba2abeb`:

- Every list screen now pages. `src/lib/list-params.ts` holds the URL state
  behind allowlists, because a sort key reaches `.order()` and a filter key
  reaches `.eq()` as column names.
- Analytics counts in Postgres (migration 045) instead of pulling every
  candidate row to build two histograms.
- Four `KpiTile`s became one; two breadcrumb systems became one; five page
  widths became two.

---

## 2. THE OPEN DECISION — needed before more UI work

**Two visual languages are in the product at once**, and consolidating the
duplication did not resolve which wins:

| | Portfolio, Candidates, Mandates | Analytics, Network, Skills, EI |
|---|---|---|
| Voice | "Needs you today" | `GLOBAL_EXECUTIVE_NETWORK`, `SKILLS_STUDIO` |
| Shape | `rounded-xl`, sentence case | sharp, uppercase, `//` separators |

A buyer moving between Portfolio and Network reads two products. Picking one
re-skins roughly twenty pages, which is why it was left: it is a brand call,
not a refactor. Ask before building more screens, or the new ones inherit the
ambiguity.

---

## 3. Priority order from the review

1. ~~Pagination and list filtering~~ — done, `ba2abeb`.
2. **Roles and route guards.** `users.role` exists, is selected in four
   places, and is compared against nothing anywhere in the codebase. There is
   no route guard beyond authenticated/not plus org-scoped RLS. Against seven
   personas this is the structural gap; the persona story does not exist until
   this column means something.
3. **Client entity.** `projects.company_name` is a text column. No clients
   table, no contacts, no client history. Note `skills/page.tsx` already
   admits the consequence: Client Skills are "same scope as search skills
   today; the type tags intent." The concept was built with nowhere to attach.
4. **Placement and fee record.** `pipeline_stage` has `offer` and `hired` and
   nothing else — no offer date, salary, fee, start date, guarantee period,
   fallthrough. A recruiting product that cannot answer "what did we bill
   this quarter" is a sourcing tool.
5. ~~Design system consolidation~~ — duplication done; see section 2.
6. **Link `/app/candidates/search` into the nav.** A 620-line AI
   natural-language candidate search that nothing links to. Minutes of work.
7. **Sample data on the other 37 pages.** Only Portfolio, Candidates and
   Mandates have it. Competencies and Templates literally tell the user to
   "check that migration 033 has been applied."

Also absent and worth a decision at some point: activity/audit trail for core
recruiting (`executive_audit_events` covers only the EI module), interview
scheduling, tasks a human can create, tags, saved views, retention and
right-to-erasure, DEI reporting. Nothing is scheduled at all — no
`vercel.json`, no cron, no `pg_cron` — so `AGENTS.md`'s agent 14 ("Scheduled
+ on-demand") has no scheduled path and weekly reports are manual only.

---

## 4. Verification debt — read before trusting the last commit

**The dashboard pages have never been seen rendered.** `ba2abeb` changed
fifteen page files. Types, lint, 389 tests and the build pass, and the
PostgREST `.or()`/range syntax and both new SQL functions were exercised
against the live API — but every dashboard route 307s without a session, so
nothing was loaded in a browser. `/app/candidates` and `/app/projects` are
the two to look at first.

Also never seen with real data: the evidence grid populated, and the HM
portal grid. The comparison PDF has now been rendered at 3/4/5/6/8
candidates, but against fixtures — real evaluation narratives may run longer
than the fixture prose, and the slate cards are where that would show.

---

## 5. Blockers not ours to clear

- **Resend.** Unchanged from the previous handoff. The marketplace resource
  `resend-email-violet-dog` is still `Onboarding`, attached to no project, and
  there is no `MANDATE_RESEND_API_KEY` in any environment. DNS is half-done:
  `resend._domainkey.getmandate.io` exists, but `send.getmandate.io` has no
  SPF TXT and no bounce MX, and the root SPF authorises Namecheap forwarding
  rather than SES. Both founder actions. Do not fall back to a test sender.
- **`ANTHROPIC_API_KEY` has no credit.** Blocks the coverage-analysis agent's
  first real run, comparison layers 4 and 5, and deleting the losing branch in
  `run-sourcing-search.ts`.

---

## 6. Known limitation carried deliberately

**The PDF fonts are the base-14 set, so no non-Latin script renders.**
`sanitizeForPdf` maps symbols a model might emit onto characters the font
has, but it cannot render a script the font lacks — a candidate named in
Chinese or Cyrillic comes out as question marks, which for a recruiting
product erases the person. It warns in dev rather than swallowing it. The
real fix is an embedded font, and it should land before sourcing outside
Latin-script markets. See `src/lib/pdf/glyphs.ts`.

**The Network page cannot page in SQL.** A person there is several candidate
rows folded by identity, and which rows fold is only knowable once all are
compared, so a LIMIT cuts a person in half rather than the list short. It
takes a 2000-row window, says so on screen, and pages the render. Doing it
properly means grouping by identity in Postgres, along the lines of migration
040. See `CANDIDATE_ROW_CAP`.
