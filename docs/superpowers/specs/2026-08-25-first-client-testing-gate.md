# The pre-launch checklist, slice four — FIRST-CLIENT TESTING — Phase 0 + THE D-GATE — 2026-08-25 — DRAFT

**Status: DRAFT. Nothing here is confirmed. The drive runs on the
founder's written word against THIS document. This slice is
different in KIND from every gate before it: its subject is not the
database or the code but the product's fitness for a real client,
and half of it can only be judged by the founder with real
material. The gate's job is to draw that line honestly.**

Scope: the §122 checklist's "Before First Client" block — the full
search loop with 8–10 real candidate CVs, the HM portal end-to-end
with a real hiring manager, the Triangulation Report with real
data, all PDF exports, email drafts opening in a mail client.

---

## Part 1 — What Phase 0 mapped, in code

### The five loops and their surfaces

1. **The search loop**: `/app/projects/[id]/candidates/new`
   (upload-form) → CV parse (retry-parse exists for failures) →
   review → ranking → shortlist → metrics. The mechanics are
   harness- and drive-proven from prior programmes; what has NEVER
   been proven is agent QUALITY against real-world CVs — which is
   the checklist item's whole point.
2. **The HM portal**: token issuance from the candidate/share flow →
   `/hm/[token]` (verify_hm_token, anon — §123's ruled set) →
   review submission (rate scopes `hm_submit_ip`/`hm_submit_token`,
   caps live). The round-trip is machine-testable; "works with a
   real hiring manager" — a person who has never seen it — is not.
3. **The Triangulation Report**: `triangulation-panel.tsx` on the
   candidate page, fed by recruiter feedback + HM reviews. Real
   data means real divergent human opinions — founder territory.
4. **PDF exports, FOUR sites**: evaluation
   (candidate page, `evaluation-actions.tsx`), comparison
   (`/comparison/export-actions.tsx`), weekly report
   (`/reports/report-actions-client.tsx`), EI report
   (`report-document.tsx`). All @react-pdf, client-rendered; the
   document builders carry unit tests (glyphs, comparison), but a
   browser-real download against live data has no drive on record.
5. **Email drafts**: built as `mailto:` URLs
   (`evaluation-actions.tsx:220`, subject+body URI-encoded). ONE
   NAMED TRAP found in Phase 0: mail clients truncate or refuse
   long mailto URLs (common ceilings ~2000 chars); a long
   evaluation body may open blank or clipped — this is exactly the
   kind of failure only checked by opening the draft, and the drive
   should measure draft lengths against the ceiling BEFORE the
   founder ever clicks one.

### What this slice is NOT

Not a build. No migration (111 stays unclaimed), no policy change,
no new machinery. Any defect found becomes its own numbered fix with
its own green gate.

---

## Part 2 — THE D-GATE (drafted, awaiting the founder's word)

### D1 — The line: what the drive proves vs what the founder judges

**Drive 0fa (machine-verifiable, scratch principals, prod):** a
scratch org + scratch operator (never the founder's session) walk:
CV upload with a SYNTHETIC test CV (parse fires, failure path
honest), HM token issue → portal load → review submit → revoke,
candidate portal round-trip, triangulation panel renders with
forged divergent feedback, all four PDF exports download and open
as valid PDFs, every email draft's mailto URL measured against the
2000-char ceiling. Teardown by VALUE — the six member-audit events
swept by name, public.users before auth.users, every minted row
deleted, baseline re-verified exact.

**The founder's sessions (real material, real judgment):** the 8–10
real CVs through the whole loop — parse fidelity, review quality,
ranking sanity, shortlist trade-offs are QUALITY judgments no
harness can make; a real hiring manager (not the founder wearing a
token) through the HM portal; the Triangulation Report over the
real feedback that session produces; the drafts opened in the
founder's actual mail client.

**Recommend: as stated — the drive runs first and clears the
mechanical ground so the founder's sessions spend zero minutes on
plumbing.**

### D2 — Real CVs are REAL PII — the data doctrine inverts

Every prior drive minted fake data and swept it. This slice
deliberately introduces REAL people's CVs into prod. Three rules:
(1) the illustrative-data label rule INVERTS — real data must never
wear the sample label, and the seeded demo content must stay
visibly distinct from it; (2) the erasure path is part of the test —
one real candidate's `candidate_erasure_requests` flow is exercised
before the slice closes, because the first client will ask; (3)
disposition is the FOUNDER's call recorded in the closing §: keep
the real candidates as the working dataset, or erase to baseline.

**Recommend: as stated. RULING REQUESTED on (3)'s default.**

### D3 — Findings land as a punch list, not as fixes

The drive and the founder's sessions produce a single numbered
punch list in the closing §, each item severity-tagged
(blocks-first-client / fix-soon / cosmetic). Fixes are their own
work with their own green gates — nothing is patched mid-drive, so
the test record stays honest about what the product WAS.

**Recommend: as stated.**

### D4 — The ladder on confirmation

Drive 0fa (scratch, mechanical, torn down, § records every probe) ·
punch list opened · founder's real-CV session · founder's real-HM
session · Triangulation over the real feedback · mail-client check ·
erasure-path exercise · disposition ruling (D2) · § 127-et-seq
DRAFTED per session, no completion declared until the founder's
word closes the checklist item.

## Part 3 — Named rulings

- **R1 — quality judgments are the founder's alone.** The drive
  proves mechanics; it never signs off on parse fidelity, ranking
  sanity, or report usefulness. No agent — including the one
  writing this — grades the product's taste.
- **R2 — real PII enters under the erasure covenant.** No real CV
  lands before the erasure path is proven live in the same slice.
- **R3 — the test record is immutable.** Defects found are recorded
  against the product as it stood; fixes happen after, gated as
  themselves.

Numbers at drafting: next migration 111 (unclaimed), next § 127,
next drive 0fa (claimed by D1 on confirmation); vitest 929;
activity CHECK 80; intent door 14; agent allowlist 29; durable
baseline 25/24/74/5/5/1/1/2/2/1/1 + tasks 0 + objectives 0 +
key_results 0.
