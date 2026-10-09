# REVIEW DRAFTS — NOT APPROVED, NOT PUBLISHED, NOT LEGAL ADVICE

**Status: DRAFT. None of these documents has been reviewed by a qualified lawyer. None may
be published, linked from the product, attached to a proposal, or signed.**

These were assembled on 2026-10-07 from `../2026-10-07-factual-annexes.md`, which records
the verified facts behind every statement. They exist so that legal review starts from an
accurate description of the system rather than a questionnaire.

## What these drafts are for

The expensive part of drafting a privacy pack is not the prose — it is establishing what the
system actually does. That work is done and cited. A lawyer can now correct the law rather
than discover the architecture.

## Scope these were written to

| Decision | Value | Source |
|---|---|---|
| First client and candidates | **United States only** | Founder, 2026-10-07 |
| Lead regime | CCPA/CPRA and comparable US state law | Follows from the above |
| Mandate's role for candidate data | **Processor / service provider** for the recruiting agency | Founder, 2026-10-07 |
| International transfers | **None in scope** — data and subjects both US | Annex E |
| Cookie consent | Very likely **not required**; disclosure only | Annex L |

**If any of those change, these drafts change materially.** A single EU or UK candidate
re-opens GDPR: Art. 13/14 notices, a lawful basis, SCCs or the UK IDTA for the `us-east-1`
transfer, and a transfer risk assessment. Annex M.3 covers that trigger.

## Documents

| File | Audience | Confidence |
|---|---|---|
| `01-terms-of-service.DRAFT.md` | The agency buying Mandate | Structure sound; commercial terms are placeholders |
| `02-privacy-notice-customers.DRAFT.md` | Agency staff using the product | High — describes verified processing |
| `03-privacy-notice-candidates.DRAFT.md` | People in the candidate database | **Most important and most sensitive** |
| `04-data-processing-addendum.DRAFT.md` | Attached to the agency contract | Several commitments deliberately blank |
| `05-subprocessors.DRAFT.md` | Published or attached to the DPA | **Cannot be signed yet — see L2** |

## Every `[DECISION: …]` marker is a real open question

The drafts contain no invented commitments. Where a document would normally state a number —
uptime percentage, breach-notification window, retention period, support response time — the
draft carries a marker instead, with the reason it is still open. **Filling one of those in
is a commercial decision with a cost attached, not a drafting detail.** The nine blocking
items are listed in Annex M.1.

## Three things that must not be done with these drafts

1. **Do not publish them to satisfy a prospect's checklist.** An inaccurate privacy notice
   is worse than a missing one — it is a representation.
2. **Do not sign the DPA's breach-notification clause** until an incident-response process
   exists (Annex I.2 — there is currently none).
3. ~~**Do not sign the subprocessor list** while `STITCH_API_KEY` and `WEBCLAW_API_KEY`
   remain unexplained~~ — **cleared 2026-10-09.** Both traced: public company names only for
   one day in May 2026, and a design tool never in the data path. Neither is a subprocessor,
   and both keys have been deleted. **The subprocessor list now waits only on L3** — an
   executed DPA with each vendor.
