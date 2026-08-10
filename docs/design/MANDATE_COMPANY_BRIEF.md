# Mandate — Company & Product Brief

**For:** Claude Design (and anyone designing, writing, or positioning Mandate)
**Version:** 1.0 · **Date:** 2026-08-10 · **Source commit:** `0b2f11d`
**Companions:** `MANDATE_DESIGN_HANDOFF.md` (design specs) · `MANDATE_SCREEN_INVENTORY.md` (screen checklist)

---

## How to read this document

Every section is labelled:

- 🟢 **GROUNDED** — verified against the codebase, live database, or rendered product. Safe to design and write against.
- 🟡 **NEEDS YOUR INPUT** — a business decision only the founders can make. Placeholders are marked. **Do not invent answers here.**
- 🔴 **DO NOT CLAIM** — things that would be false or unsubstantiated today.

This split exists because the fastest way to destroy the trust Mandate sells is to assert something a prospect can disprove in one question.

---

# 1. What Mandate is 🟢

**Mandate is an AI operating system for executive search.**

A recruiter types one line — *"Head of IT Operations for RBC Capital Markets"* — and the system turns it into a running search: it decomposes the mandate, researches the company, drafts a role specification, builds a weighted scoring model, writes the sourcing queries, parses CVs, evaluates each candidate against the calibrated model, ranks them into tiers, and produces a defensible shortlist with trade-offs.

Seventeen specialist AI agents do the work. Each has a defined trigger and a defined output. They write into a shared database, and the application orchestrates them. **A human reviews, edits, and approves at every meaningful step.**

It is not a chatbot with a recruiting theme. It is a pipeline with a system of record.

### The one-sentence version

> Mandate turns a one-line brief into a calibrated, evidence-backed executive shortlist — and keeps a human accountable for every judgment along the way.

---

# 2. The problem we exist to solve 🟢

Executive search is judgment work performed under bad conditions.

A senior hire costs seven figures when it goes wrong, and the process that produces it is mostly undocumented instinct: dozens of CVs skimmed at speed, a hiring manager whose stated requirements drift from their revealed preferences, no shared scoring model, and no trail explaining why one person advanced over another. Decisions get made on recency and charisma, then rationalised afterwards.

The product's own marketing names three failures:

1. **Briefing takes days.** Fragmented intake calls, scattered notes, inconsistent calibration. The first week is gone before sourcing begins.
2. **Evaluation drifts across a team.** Two recruiters look at the same CV and rank it differently. Without a shared model, decisions flip with whoever ran the screen call.
3. **The signal lives in twelve tools.** Email threads, ATS notes, Slack DMs, call recordings, scribbles. What matters is in the inbox, not the system.

> 🔴 **Note on the statistics currently on the live site.** The homepage presents "3–5 days", "67% evaluation drift", and "12+ tools" as facts. **None are sourced.** For a product selling defensibility to executives, an unsourced statistic is a liability — the first prospect who asks "where's that from?" undermines the entire pitch. Either substantiate them, attribute them, or reframe as qualitative. **NEEDS YOUR INPUT.**

### What Mandate does about it

It makes judgment **explicit, weighted, versioned, and traceable** — without pretending the machine should decide.

---

# 3. Who it is for 🟢

**Primary:** boutique and mid-size **executive search firms** — the consultant or partner running senior mandates for clients, who must justify a slate to a paying customer.

**Secondary:** **in-house talent teams** running executive and senior leadership hires, who must justify a slate to a board or CEO.

Inferred from the product's own pricing structure:

| Plan | Shape | Implied buyer |
|---|---|---|
| Starter $399/mo | 1 user, 3 active searches | Solo consultant / independent |
| Growth $999/mo | 5 users, 10 active searches | Boutique firm |
| Agency $1,899/mo | Unlimited | Established search firm |

> 🟡 **NEEDS YOUR INPUT:** whether the real target is search *firms* or in-house teams. The product serves both, but the marketing, proof, and sales motion differ substantially. Everything on the public site past the homepage is blocked on this answer.

### The person who actually uses it

A search consultant who is good at their job, under time pressure, and whose professional reputation rests on the quality of the slate they present. They are not impressed by novelty. They are impressed by not being embarrassed in front of a client.

---

# 4. What makes Mandate different 🟢

Four things, all verifiable in the implementation.

### 4.1 Calibration before evaluation

The scoring model is derived from a structured intake and **approved before any candidate is scored**. The bar is set before the faces appear. This is the opposite of the usual pattern — where criteria get retrofitted to justify whoever impressed the hiring manager.

### 4.2 Triangulation

Three research streams are fused into one view of fit: **candidate research**, **hiring-manager research**, and the **role requirements**. Not "does the CV match the JD", but "does this person fit this role, under this manager, at this company, right now".

### 4.3 Executive Intelligence — auditable executive due diligence

The premium module. It answers:

> Has this candidate *demonstrated* the experience, judgment, leadership capability, operating scale, and company-stage fit required to succeed in **this** executive role — not "did they interview well."

It runs as a gated chain — success profile → linked candidate → interview plan → assessment — where each step requires human approval of the one before it. And it is built like a system of record, not a chat log:

- **Approved artifacts are immutable at the database layer.** A trigger rejects edits to approved records for every role, including the service account. Corrections create a new version; the old one is archived, never overwritten.
- **Approval identity cannot be forged.** The approver is derived from the session inside the database, not supplied by the client.
- **The audit trail is append-only.** Twenty-three defined event types, no update, no delete.
- **The application computes the facts; the AI only words them.** Competency coverage and evidence strength are calculated server-side. Hallucinated competency keys are discarded.
- **The assessment has no AI at all.** The human records the evidence.

That combination is the moat. It is also the thing most likely to be lost in a redesign that treats EI as "AI output with a save button".

### 4.4 The recruiter stays accountable

Every AI panel is labelled decision support. Approval is an explicit human act, recorded with identity and timestamp. Generation alone never becomes operational truth — competency weights only take effect when a human approves them.

---

# 5. Product principles — non-negotiable 🟢

These are enforced in the code, in the agent prompts, and in the database. They are not aspirations.

1. **All AI output is decision support.** Never a hire/no-hire verdict.
2. **No psychological or mental-health labels.**
3. **No inference of protected characteristics.**
4. **No deception detection.**
5. **No audio, video, facial, or voice analysis anywhere in the product.**
6. **Evidence-based statements only.**
7. **Humans approve every artifact.**
8. **Approved records are immutable; changes create versions.**
9. **The audit trail cannot be edited or deleted.**
10. **Evidence strength is not a candidate score** — it measures how much of the role's weighted competencies have supporting evidence recorded. It is explicitly not a rating of the person.

**Why this matters commercially, not just ethically:** hiring is a regulated, litigable domain. A product that scores humans with an opaque model is a liability its buyers cannot adopt. Mandate's restraint is the reason an executive can put it in front of a board.

---

# 6. Brand personality and voice 🟢

### Personality

**Executive · Editorial · Intelligent · Serious · Premium · Trustworthy.**

High information density without hostility. The reference is a Bloomberg terminal crossed with an editorial newsroom — instruments for a professional, not a consumer dashboard and not an AI startup.

### Voice

The existing copy is confident, concrete, and unhyped. It states mechanisms rather than benefits:

> *"Live web research on the hiring company — strategy, leadership, recent moves."*
> *"Auto-recalibrates dimension weights from every feedback signal you capture."*
> *"Not yet generated. The Role Architect drafts it from this intake and the company research; you review and approve."*
> *"The way executive search works today is broken in three places."*

**Rules that fall out of that:**

- Say what the system does, not how amazing it is
- Name the mechanism — "the Role Architect drafts it" beats "AI-powered insights"
- Explain consequences in empty states, not just absence
- Short declaratives. Em-dashes for precision, not decoration
- Never "revolutionary", "seamless", "game-changing", "supercharge", "unlock"
- Never exclamation marks
- Never emoji in product UI

### Emotional target

A user should feel **the work is being taken seriously**. Not delighted, not entertained — *respected*. The feeling to aim for is the one you get from a well-made instrument: nothing decorative, everything deliberate.

### Visual non-negotiables

**Never:** AI gradients · glassmorphism · neon glow · decorative clutter · playful illustration · emoji iconography · stock photography of people in offices.

**Always:** dark, restrained, typographic, dense-but-legible, motion under 280ms.

---

# 7. Where the company is today 🟢

Stated plainly, because design decisions depend on it:

| | |
|---|---|
| **Stage** | Pre-launch, closed beta |
| **Live at** | getmandate.io (Vercel) |
| **Customers** | **Zero.** The database contains 1 organisation, 1 user, 1 project, 1 candidate |
| **Access** | Waitlist + manual founder approval. No open signup |
| **Billing** | None. Prices are advertised; nothing can be purchased |
| **Built** | Core recruiting pipeline + Executive Intelligence through Assessments |
| **Spec'd, not built** | Stripe billing · EI Risk Reviews |
| **Not built** | Team management · candidate import · outreach · mobile navigation |

**Design implication:** this is a product being readied for its first customers, not one being scaled. Every surface should be built for the first serious prospect's scrutiny — and nothing should imply a customer base, scale, or compliance posture that does not yet exist.

---

# 8. Goals and ambitions 🟡 **NEEDS YOUR INPUT**

**This is the section I cannot write for you**, and the one Claude Design most needs. Goals are business strategy — inventing them would put words in your mouth that then propagate into every page of the website.

Please fill these in. I've made each one specific enough to answer in a sentence or two.

### 8.1 The mission
> *One sentence: what does Mandate exist to change about executive hiring?*

**→ [YOUR ANSWER]**

### 8.2 The 12-month goal
> *What does success look like a year from now? Number of firms? Revenue? A specific reference customer? Shipping a particular capability?*

**→ [YOUR ANSWER]**

### 8.3 The buyer you are actually chasing first
> *Search firms or in-house teams? Which segment, which size, which geography? Everything on the public site past the homepage depends on this.*

**→ [YOUR ANSWER]**

### 8.4 What you are competing against
> *Not necessarily named competitors — often it's "a spreadsheet and the consultant's memory", or an incumbent ATS. What does a prospect do today instead of buying Mandate?*

**→ [YOUR ANSWER]**

### 8.5 The one thing a prospect must believe
> *If a visitor leaves the site remembering exactly one idea, what is it?*

**→ [YOUR ANSWER]**

### 8.6 The proof you can actually offer
> *You have no customers yet. What can a prospect verify today? The live simulator is real and impressive. Is there a pilot, a design partner, a founder's track record in search, a demo you'll run personally?*

**→ [YOUR ANSWER]**

### 8.7 Pricing intent
> *Is Executive Intelligence the premium wedge or a broad add-on? What does the EI add-on cost? (This also blocks the billing build.)*

**→ [YOUR ANSWER]**

### 8.8 Where the product goes after launch
> *Risk Reviews and final reports are spec'd. Beyond that — outreach? ATS integrations? Multi-user teams? Knowing the direction stops the design painting you into a corner.*

**→ [YOUR ANSWER]**

---

# 9. What we will not claim 🔴

Binding for every page, screen, and piece of copy until the underlying fact exists.

| Do not claim | Why |
|---|---|
| Customers, logos, testimonials, case studies | Zero customers exist |
| Named client references | Same |
| SOC 2, ISO, GDPR compliance, pen tests | None substantiated. The internal checklist still lists an unrotated service-role key, no rate limiting on the access form, and no error monitoring |
| Uptime or SLA guarantees | No status page, no monitoring |
| Placement statistics, time-to-hire improvements, ROI figures | No customer data to derive them from |
| "Trusted by…" in any form | Nothing to point at |
| Team size, funding, offices | Not established here |
| The unsourced 3–5 days / 67% / 12+ tools stats | Presented as fact without attribution (§2) |

**What you *can* say, truthfully, today:**

- 17 specialist agents with defined roles
- Calibration is approved before candidates are scored
- Approved records are immutable at the database layer
- The audit trail is append-only
- Approver identity is derived from the session and cannot be forged
- No audio, video, facial, or voice analysis
- No hire/no-hire verdicts, ever
- **The live simulator on the homepage is real** — a genuine model call with live web research against a working endpoint, returning real structured output

That last one is the strongest asset the company currently has. A prospect can type their own live mandate and watch the product think. Lead with it.

---

# 10. How to use this for design

**The feeling to design for:** a serious instrument for serious work. A search consultant should open it and think *this was built by someone who understands what I actually do* — not *this looks like a startup*.

**The three ideas the design must carry:**

1. **The pipeline is real and running.** The agent tiles with live states (`ACTIVE`, `QUEUED`, `COMPLETE`) are the most distinctive interface idea in the product. Elevate them.
2. **Executive Intelligence is a system of record.** Versions, approvals, provenance, and audit are the *content*, not the chrome. It should read as an executive document, not a chat.
3. **The human is accountable.** Approval is deliberate and consequential. AI output is a draft until a person signs it.

**The trap to avoid:** making it look like every other AI product. The restraint is the positioning. A gradient hero with a glowing orb would say "we're an AI startup" to an audience that is specifically not buying an AI startup — they're buying defensibility.

---

**Open items blocking public-facing work:** §8 (all), §3 buyer segment, §2 statistics, and the EI add-on price.
