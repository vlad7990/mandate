# LAUNCH READINESS — as at 2026-08-26 (§172)

Written at the founder's request. This is a status document, not a
plan: it says what is true, what is blocking what, and who can move
each item. It does not propose work.

---

## 1. Where we actually are

**Every agent-runnable line of the pre-launch checklist is closed.**
Nothing is half-built, nothing awaits confirmation, the tree is clean
and production is current. vitest 1110; migrations through 128;
CHECK 93; intent doors 26; agent allowlist 29; anon-executable roster
12 (the ruled number, verified today).

**The qualification that matters more than any line below:**

> Every capability in this product has been proven against fixtures
> **I built and then deleted**. That is rigorous — each drive ran live
> in production against real RLS, real agents and real refusals — but
> it is not the same as a real search. I chose what the fixtures
> contained, so I also chose what they could reveal.
>
> The database sits at 2 sample clients, 1 candidate, a non-final job
> spec, and zero invoices. **The product has never met a real client.**

That single fact is what most of Section 2 is about.

---

## 2. The gate in front of everything else

### 2.1 A real search, with real CVs — FOUNDER

The §128 testing half, still open:

- 8–10 real candidate CVs through parse → evaluate → rank → shortlist
- A real hiring manager through the client portal, end to end
- Email drafts opened in a real mail client
- A real erasure exercise
- The D2 disposition ruling

**Why this outranks everything else on the list:** it is the first
independent test of the system's *judgment* rather than its plumbing.
The drives proved that the machinery holds — permissions, refusals,
trails, teardowns. They could not prove that a parsed CV is parsed
*correctly*, that a ranking is *defensible*, or that a calibration
model measures what a recruiter would measure. Fixtures cannot falsify
those, because the same author wrote the fixture and the expectation.

It also unblocks work that is otherwise stuck: the `parse_cv`
benchmark, and with it the dormant model-escalation pair.

**Nothing on this list is a substitute for it.**

---

## 3. Blocking before a first client

| Item | Owner | State |
|---|---|---|
| Real-CV / real-HM testing (§2.1) | Founder | Open |
| Agency sending domain verified with Resend | Founder | Open — invoices currently send from `getmandate.io` |
| Service-role key rotation | Founder | Open — the key was exposed in a terminal |
| `SUPABASE_SERVICE_ROLE_KEY` re-set after rotation | Founder | Follows the above |

**On the sending domain:** invoicing works today and drive 112 sent a
real invoice through Resend. The only issue is the *from* identity — a
client would receive an invoice from `getmandate.io` rather than the
agency. `from_email` lives on the invoice template, so this is a
settings change once the domain is verified, not a code change.

---

## 4. Blocking before public launch

| Item | Owner | State |
|---|---|---|
| Turnstile / hCaptcha on `/request-access` | Founder | **Both keys absent.** The form is live and unprotected. |
| Leaked-password protection | Founder | Still WARN in the Supabase advisor (dashboard toggle) |
| Uptime monitor (D4 / UptimeRobot) pointed at `/api/health` | Founder | Open — the endpoint and `/status` are live and tested |
| Stripe billing | Founder | **Parked LAST by standing order.** No keys, no code. Cannot take money. |
| Proof and fit on the marketing site | Founder + build | Ungated. Needs a client to point at — see §6. |

**On Turnstile:** rate limiting is live and proven (§088 — money fails
closed, identity fails open), so the form is not defenceless. But
`/request-access` is a public write with no bot challenge, and it is
the one surface a launch announcement points at.

---

## 5. Live but deliberately dark

These are built, wired and honest about their own absence. They are
not defects; each will light up when its secret lands.

| Capability | Missing | Effect today |
|---|---|---|
| Invoice bounce/delivery feedback | `RESEND_WEBHOOK_SECRET` | Deliveries record `sent`; bounces never arrive. The resolver is built and was exercised directly in drive 112. |
| Call transcription | `DEEPINFRA_API_KEY` | Audio records and plays; the transcribe control is honestly absent. `vercel integration add deepinfra` lights it with no deploy, then one endpoint-shape check. |

---

## 6. Not blocking, but worth knowing

**The site is accurate on capability and empty on proof.** As of §170
the homepage carries no case study, customer, outcome number, named
buyer, switching story or guarantee. `/solutions` names the buyer where
the homepage does not.

This cannot honestly be closed while there are no clients — inventing
evidence would breach the house rule that non-real data is labelled at
the point of display, and is not a thing to walk back. It is therefore
**downstream of §2.1, not parallel to it.**

**Twilio** stays parked with its needs-checklist. The cheap call-logging
slice shipped instead (§157) and covers notes, consent-checked audio
and playback.

**Judge debts** (max_tokens 600, fixture digest) and the **Q4
cross-provider spike** remain deferred router work.

---

## 7. What is already done — so it is not re-litigated

Closed and confirmed as law: the **invoicing + print** programme
(§162), the **client portal** (§166), the **LLM router** all four
slices (§154 + §157), **call logging** (§157), **OKRs** (§121),
**status/health** (§140), **onboarding + handbook** (§138), **admin
member management** (§136), **rate limiting** (§088), **Sentry**
(present in prod), **marketing performance** (§168), and the
**homepage/roster truth** thread (§170–§172).

Security posture, swept today: the advisor's anon-executable set is
**exactly the ruled twelve, by name** — an independent confirmation of
a roster the house counts by hand. No new findings. The 51 SECURITY
DEFINER warnings are the 069 doctrine, not defects against it.

---

## 8. Who can move what

**Only the founder:** every item in §3 and §4, and both secrets in §5.
They are credentials, DNS, dashboard toggles, a payment provider, and a
judgment about real candidates. None can be delegated to me.

**Me, on your word:** the positioning slice once there is something
true to say; the `parse_cv` benchmark once the CVs exist; Stripe when
it is unparked; anything the real-CV testing turns up.

**The honest summary:** development is not the bottleneck. A first
client is.

---

*Numbers at time of writing: next migration 129; next § 173; next drive
117; vitest 1110. Baseline: 26 users / 25 agents / 77 events / 2
projects / 2 clients / 1 candidate / 0 invoices.*
