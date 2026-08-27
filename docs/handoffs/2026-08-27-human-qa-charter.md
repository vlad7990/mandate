# THE HUMAN QA CHARTER — 2026-08-27

For the people testing Mandate. Read the two lists at the top before you
touch anything: they will save you filing a dozen defects that are not
defects.

---

## 0. How to get in

You do not get an account handed to you. You request one, exactly as a
real user would:

1. Go to **`/request-access`** and submit the form.
2. The founder approves it. Approval provisions **an organisation and an
   invitation** — it never creates your account.
3. You get an invitation link. At **`/join`** you set **your own
   password**. That is the moment your account exists.

**This is itself the first test.** If any part of it feels wrong, that is
a finding — file it before you go any further.

Use the **QA organisation**, not the house one. Data you create there is
real data in a real database: it persists, it is not swept between
sessions, and it is what later screens will be built out of.

---

## 1. Known-dark — DO NOT FILE THESE

Deliberately unlit. Every one of these is a decision, not a bug.

| What you'll see | Why |
|---|---|
| Emails arrive from an unverified domain, or land in spam | The agency's sending domain is not yet verified with Resend |
| Bounces never come back / delivery status stays put | `RESEND_WEBHOOK_SECRET` is absent — bounce feedback is dark |
| Call recordings never produce a transcript | `DEEPINFRA_API_KEY` is absent — transcription is dark |
| No telephony anywhere | Twilio is parked, deliberately |
| No billing, no card, no subscription | Stripe is parked, and is last by design |

## 2. Known-behaviour — surprising, but correct

These look like bugs and are not. They are the ones most likely to burn
your time.

- **A long email draft opens with a one-line body.** Mail clients
  truncate `mailto:` links over ~2,000 characters, so a long draft puts
  the **full body on your clipboard** and opens the mail window with a
  pointer. Paste it. Nothing was lost. (If the clipboard is blocked, it
  refuses to open at all and tells you to use Copy — also correct.)
- **Screens show a sample workspace with a banner.** Every screen with
  nothing real to show renders fabricated data behind a labelled banner.
  **You cannot act on it** — it is a picture, not rows. Dismiss it, or
  create something real. If sample data ever appears *mixed in with* your
  own real rows, that IS a defect and a serious one.
- **The judgment chain takes about 95 seconds.** Upload a CV and the
  parse → evaluation → second-opinion → ledger chain runs in the
  background. Measured: ~90s of model time. It is not stuck. Wait before
  filing.
- **Some agents refuse to run and say so.** Refusals are a feature. An
  agent that says it cannot run and why is behaving correctly; an agent
  that silently produces nothing is not.
- **A CV cannot rename an applicant.** If you apply through a public link
  with one name and upload a CV with another, **your typed name and
  address are kept** and the trail notes the disagreement. That is G.1,
  ruled deliberately.
- **The Network screen grows people named after files.** Upload
  `avery-penhallow-cv.pdf` and a profile called `avery-penhallow-cv`
  appears. A recruiter upload creates its row *before* anyone has read
  the CV, so it is keyed on the filename, then re-keyed onto the real
  person once parsing finishes — and the filename-shaped one is left
  behind. **Known, cosmetic, and already written up** (§194). Nothing
  reads those rows and no do-not-contact flag rides on them. Worth
  telling us how noisy it actually gets in practice — that is the open
  question — but it is not a new finding.

---

## 3. The five loops, in the order to test them

**Order matters.** Loops 2–5 need the data loop 1 creates; running them
first will show you empty screens and waste a pass.

### Loop 1 — the search loop *(do this first, and do it properly)*

Client → mandate → job spec → calibration → upload CVs → review →
ranking → shortlist.

Upload **several** CVs, deliberately varied: a strong fit, a weak fit,
one with a gap, one that is barely a CV at all. The point is not that the
app accepts them — it is whether the **judgment is any good**, which is
the one thing no machine test has ever checked.

For each: does the tier match what you would have said? Does the evidence
cited actually appear in the CV? Does the second opinion disagree where
you would disagree? **Where the system is confidently wrong, that is the
single most valuable finding you can produce.**

### Loop 2 — the HM portal

Issue a token from the candidate flow, then open it **as the hiring
manager**, ideally on a different device and by someone who has not seen
the product. Submit a review. Does the invitation explain itself to
someone with no context?

### Loop 3 — the Triangulation Report

**Needs two people who actually disagree.** One submits recruiter
feedback, another submits an HM review, with genuinely different
opinions of the same candidate. Then read the report: does it represent
the disagreement honestly, or does it flatten it?

### Loop 4 — PDF exports, four sites

Evaluation (candidate page) · comparison · weekly report · EI report.
Download each **in a browser, against your own data**. Check glyphs,
page breaks, and whether anything is clipped. Print one from the panel
too — a panel should print alone, without the rest of the page.

### Loop 5 — email drafts

Open a draft from each site. See §2 on the clipboard fallback before
filing anything.

---

## 4. Then: the permission seams

Different roles see different things, and that is where quiet defects
live. With more than one account, check each staff role — **admin,
manager, recruiter, researcher, viewer** — and each external role —
**hiring_manager, client_hr, client_admin**.

The question at every screen: **can this role see or do something it
should not?** External roles live on `/portal`, never `/app`, and hold
no organisation capability at all — not even read. A single leak across
that boundary is the most serious class of defect in the product.

---

## 5. How to file a finding

**Findings land as a punch list, not as fixes.** Nothing gets fixed
mid-pass — a fix invalidates everything tested before it and destroys
the run's meaning. Collect, then triage.

For each finding:

- **Where** — the URL, and which role you were signed in as
- **What you did** — enough to repeat it
- **What you expected**, and **what happened**
- **A screenshot**, if it is visual
- **When** — the approximate time, so it can be matched to the error trail

Two things worth flagging above all others, because automated tests
cannot see them:

1. **The system being confidently wrong about a person.** A tier, a
   claim, a risk, a summary — anything stated with more certainty than
   the evidence supports.
2. **Anything asserting something it does not know.** The house calls
   this its defect class: "unattributed" quietly becoming "no evidence
   of". If a screen tells you something it could not possibly know, that
   is a finding even if it looks harmless.

---

## 6. Before the first tester signs in — founder

- [ ] **Toggle leaked-password protection in Supabase.** Ordering
      matters: testers are about to set real passwords.
- [ ] Verify the agency's sending domain with Resend, or accept that
      every email test produces a false failure.
- [ ] Rotate the service-role key before more people hold access.
