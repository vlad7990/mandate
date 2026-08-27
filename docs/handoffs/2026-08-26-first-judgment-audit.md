# FIRST JUDGMENT AUDIT — the one real CV in the system

2026-08-26. Not a § entry. This is a findings document: it records what
an audit of live production data found, and nothing here has been fixed.

## What this is

Every drive to date has tested *plumbing* — permissions, refusals,
trails, teardowns — against fixtures I wrote and then deleted. §128
exists because that cannot falsify the system's **judgment**.

This is the first look at judgment. The subject is the only real CV in
the database: candidate `78c0bff0-7fb2-443e-8862-1c6f2ace2ade`
(Vladimir Breygin), uploaded 2026-04-30, parsed clean
(`cv_parse_error: null`), carried all the way through evaluation,
psychology and a positioning kit with three client-facing emails.

**Note on reading the source.** Agent principals cannot read the `cvs`
bucket — `can_read_org()` admits only
`admin | manager | recruiter | researcher | viewer`, so the parser sees
bytes at upload time and never again. The audit below was therefore
written first from stored output alone, with open items marked
**[needs PDF]**. The founder then dropped the file at
`evals/fixtures/cvs/Vladimir Breygin CPO.pdf` (582,147 bytes — exact
byte match to the stored object) and every open item was adjudicated.
See **ADJUDICATION** at the foot of this document. Where the first pass
was wrong, it is marked WITHDRAWN and left in place rather than edited
out.

**Second limit:** in this fixture the founder is *both* the CIO who set
the role's non-negotiable condition *and* the candidate being scored.
That makes it a poor test of fit judgment specifically. It is still a
valid test of everything below.

---

## F-A — Nothing watches the seam between the role spec and the calibration model. STRUCTURAL.

`projects.calibration_model.role_title` and `.inferred_scope` are
written **once**, by the Intake/Calibration agents, from the one-line
input. They are never revised afterwards:

- `finalize_job_spec` (verified by definition) touches `job_specs`
  only — it never revisits `projects.calibration_model`.
- The only post-intake writer of `calibration_model` is
  `applyCalibrationSuggestionAction`
  (`src/app/(dashboard)/app/projects/[id]/actions.ts:799`), and it
  writes `dimension_weights` alone.
- Feedback recalibration likewise moves weights, not the role.

Meanwhile every downstream consumer reads the role from
`calibration_model`, not from the spec:

| Consumer | Site |
|---|---|
| Candidate evaluation | `projects/[id]/actions.ts:198,201` |
| Network parse | `candidates/network/actions.ts:195` |
| Sourcing | `projects/[id]/sourcing/actions.ts:274` |
| Project header | `projects/[id]/page.tsx:377` |

So the Role Spec Agent can write a role that contradicts the
calibration model, a recruiter can mark it final, and **every scoring
agent keeps reading the original one-liner's inference.**

This is the recorded lesson repeating: *a single source of truth only
ends drift below it — ask what watches the seam above.* Nothing does.

Note the asymmetry: the sourcing door **refuses a non-final spec**, so
sourcing is gated on the spec existing and being final. Evaluation is
gated on nothing — it reads `calibration_model` whatever state the spec
is in.

## F-B — The drift already happened, and it inverted a verdict. LIVE.

On project `b076b20b` (RBC Capital Markets):

- One-liner: *"Head of IT Operations for RBC Capital Markets"* →
  `calibration_model.role_title: "Head of IT Operations"`,
  `inferred_scope: "…overseeing IT operations…"`. **Still the value in
  production today.**
- The job spec written afterwards from the onboarding answers describes
  a different job — *Global Head of CM Operations, Regulatory, and
  Supervisory Technology* — and rules the first one out **twice, in
  terms**:
  > "This is not an infrastructure or production-estate management role"

  > "infrastructure or production-estate IT operations experience does
  > not satisfy this requirement"

The evaluation scored against the calibration model, and marked the
candidate **down for precisely the thing the spec says is not the job**:

- `technical: 5/10` — *"no evidence of hands-on IT infrastructure
  ownership, SRE…"*
- gap — *"requires an operator mindset with live accountability for
  system uptime and operational resilience"*, *"no recent evidence of
  managing incident response, infrastructure SLAs, or run-the-bank
  obligations"*
- `alignment_test.question` — *"…ownership … of a 300-plus person IT
  operations function?"* → `light: red`
- `final_verdict.tier: tier_3`, `recommendation: do_not_include`

**Honest caveat on sequencing:** the evaluation ran 2026-04-30 21:25;
the spec was written 2026-05-01 01:17, ~4h later. At scoring time the
spec did not exist, so this is not "the code ignored a spec in front of
it." It is F-A: no mechanism exists that would *ever* reconcile them.
The calibration model still says "Head of IT Operations" today, so
re-running the evaluation now reproduces the same framing.

**Direction of the error matters.** This is a false negative — a
`do_not_include` produced partly by a mis-scoped role. False negatives
are the invisible failure mode: rejected candidates never complain, and
no one audits the pile.

## F-C — Elapsed-time arithmetic disagrees with the parse. [needs PDF]

`roles[0]` (ESP) has `start_date: "2017"`, `end_date: "present"`. The
evaluation ran 2026-04-30. That is **nine** years.

The output says **seven**, repeatedly and load-bearingly:

- gap headline — *"Seven years out of in-seat operational leadership"*
- `risks[0]` — *"has been external adviser since 2017"*
- psychology `watch_outs` — *"Seven-year consulting gap"*
- `recommendation_rationale` — *"a seven-year consulting gap"*
- **`positioning_kit.emails[0].body`** — *"since 2017"* framing sent to
  a client
- pitches, all three tones

One of the two is wrong: either the parse's 2017, or the arithmetic.
Reads like a model anchoring "now" on training-era time rather than the
run date. It reaches client-facing email text either way.

## F-D — Absence of evidence is restated as a fact about the candidate.

The scoring table is careful and correct:

> *"the CV cannot substantiate managers-of-managers experience at this
> scope"* · *"Evidence for this specific must-have is absent."*

Other fields in the same document are not:

- `risks[1]` — *"Team scale and budget authority **significantly
  below** RBC role requirements"*
- conservative pitch — *"materially below the $100M opex and 400-person
  team threshold"*

The CV states no headcount at all. "Not evidenced" and "significantly
below" are different claims, and the second one appears in the material
that goes to a client. The system is internally inconsistent about how
it treats a gap in the source document.

## F-E — Probable parse artefact. [needs PDF]

`roles[1].title` = *"COO / **Difecto** CIO – Senior Program Director"*.
"Difecto" is not a word. Most likely *"de facto CIO"* mis-read out of
the PDF. If so it has propagated into the stored profile and every
document built on it.

## F-F — Smaller items, all [needs PDF]

- Three roles — GBSG, Vander Mollen, UCSG — all carry `2010`–`2012`
  concurrently. Real, or invented parallelism from an ambiguous layout?
- `location: null`, while `linkedin_url` and `email` parsed fine.
- `years_experience: 15` against roles spanning 2010 → present (16).
- `email` is `vlad@flexcpo.com` while `current_company` is *Enterprise
  Solution Providers (ESP)*.

---

---

# ADJUDICATION — against the source PDF

Two pages. Read in full.

## The decisive question: does the CV state headcount? **NO.**

Nowhere. The closest the document comes is "leading global teams" in
the summary and "Cross-functional Group/Team Leadership" in the skills
list. The only hard number attached to scope is the "$50 million P&L"
at Sberbank CIB.

So the evaluation's claim — *"The CV does not provide team size for any
role"* — is **true**, and the parser dropped nothing. **The worst case
for F-B is off the table.** The `do_not_include` is not built on lost
data. F-B's mis-scoping half stands unchanged.

## The parser comes out well

Four of the six suspicions were wrong, and they were wrong in the
parser's favour:

- **F-E WITHDRAWN.** The CV reads, verbatim: *"COO / Difecto CIO –
  Senior Program Director"*. The parser transcribed it exactly. The
  typo — presumably "De facto" — is in the source document. Faithful
  transcription of a flawed input, which is the correct behaviour.
- **F-F concurrent roles WITHDRAWN.** The CV lists GBSG, Vander Mollen
  and UCSG together under a literal **ADDITIONAL ROLES** heading, all
  three stamped 2010–2012. The parallelism is the document's, not the
  parser's.
- **F-F `location: null` WITHDRAWN.** The CV carries email, phone,
  website and LinkedIn — and no address or city. `null` is the honest
  answer. (A US area code is present; the parser correctly declined to
  infer a location from it.)
- **F-F flexcpo/ESP WITHDRAWN.** The CV's contact block really is
  `vlad@flexcpo.com` / `www.flexcpo.com` above an ESP employment entry.
  Faithful.

## F-C CONFIRMED — the elapsed-time arithmetic is wrong

The CV reads **"2017 - Present"** for ESP. The parse recorded 2017
correctly. So the parse is right and the *arithmetic* is wrong: 2017 to
the run date of 2026-04-30 is **nine** years, not seven.

Corroborated independently by `years_experience: 15` — the CV states no
total, and its roles span 2010 → present, which is sixteen. Both errors
point the same way: the model is computing elapsed time against an
internal "now" of roughly 2024–25 rather than the actual run date.

This reaches `positioning_kit.emails[0].body`, which is client-facing.

## F-G NEW — the evaluation contradicts the parse it was handed

Page 2 of the CV, under *Chief Information Officer (CIO) Contributions*:

> "Led the strategic IT infrastructure overhaul, introducing cloud
> computing solutions that boosted system reliability by 40% and reduced
> IT operational costs by 30%."

The parser **captured this**. `cv_structured.transformation_experience`
contains *"IT infrastructure overhaul including cloud migration (CIO
contributions)"*, and `tech_exposure` lists Cloud computing and
Cybersecurity.

The evaluator, reading that same record, wrote:

> `technical: 5/10` — *"the CV provides no evidence of hands-on IT
> infrastructure ownership…"*

Those cannot both be true. In fairness the page-2 bullets are
unattributed and undated — generic "Contributions" lists tied to no
employer — so **discounting** them is defensible. Asserting they do not
exist is not.

## The through-line: weak evidence is reported as no evidence

F-D, F-G and half of F-B are one defect wearing three hats. The system
repeatedly converts *"unattributed / undated / not quantified"* into a
flat *"no evidence of"* or *"significantly below"*. The scoring table
gets this right — *"cannot substantiate"*, *"Evidence for this must-have
is absent"* — and then the risks array, the gap headlines and the
client-facing pitches restate it as settled fact about the person.

For a document that goes to a client about a named individual, that
distinction is the whole ballgame.

## F-H NEW — the schema cannot represent education or certifications

`CANDIDATE_PROFILE_SCHEMA` (`src/lib/ai/cv-parsing.ts:97`) sets
`additionalProperties: false`, and neither its `required` list nor its
`properties` map contains **education**, **certifications**, or
**phone**.

This CV carries all three:

- MBA, Finance — Kharkiv State University of Food & Trade Technology
- BS, Accounting & Audit — same institution
- PMI – IPMA – Level A Certified
- Certified Scrum Master
- Phone: a US number in the contact block

All of it is discarded at parse time and unrecoverable downstream. Note
that `public.candidates` **has a `phone` column** that no CV parse can
ever populate.

For executive search this is a live gap: credentials are routinely a
client filter, and the institution behind a degree is exactly the sort
of thing a hiring manager asks about.

## Credit where it is due

`risks[2]` reads: *"CV metrics appear high-level and difficult to
verify; credibility risk in due diligence."*

That is the single most obvious real-world problem with this document —
it is wall-to-wall unverifiable percentages (29%, 50%, 40%, 30%, 25%,
45%, 80%, 60%, 35%, 20%) — and the system caught it unprompted and said
so plainly. That is good judgment, not plumbing.

(Two things it did *not* catch, which a careful recruiter would: a
bullet duplicated verbatim under *Chief Strategy Officer*, and "CTO"
used as the abbreviation for both *Chief Transformation Officer* and
*Chief Strategy Officer* in adjacent headings.)

---

## What would close this

1. ~~The PDF~~ — **done**. Adjudicated above.
2. A ruling on **F-A** (the unwatched seam) and on **F-C**, **F-G**,
   **F-H**. None is fixed; none should be fixed without a gate.
3. 8–10 more CVs. One CV cannot test ranking, and
   `comparison.competitors: []` is the system saying so itself. This
   audit tested parse fidelity and evaluation reasoning. It could not
   test the ranking or shortlist agents at all.
