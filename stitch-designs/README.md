# Stitch Design References

Frozen UI reference HTML exported from Stitch project **Mandate Executive Search OS** (`projects/2373643971421888480`). Use these as the visual source-of-truth when implementing screens — layout, copy, hierarchy, and component composition should match unless an explicit decision says otherwise.

`PRD.md` is the product spec these designs render against.

## File → Agent → Stage map

Files are numbered in the order of the recruiter journey, which also drives the MVP build order.

| # | File | Mandate agents involved | MVP stage |
|---|---|---|---|
| — | `PRD.md` | (spec) | — |
| 01 | `01-secure-authentication.html` | none — platform auth (Supabase Auth) | **Stage 0 — Foundation** |
| 02 | `02-operator-sign-in.html` | none — platform auth (Supabase Auth) | **Stage 0 — Foundation** |
| 03 | `03-project-command-center.html` | 13 Recruiter Copilot, 14 Metrics / Search Health | **Stage 1 — Workspace shell** |
| 04 | `04-role-intake-intelligence.html` | 1 Intake, 2 Company Research | **Stage 2 — Role creation** |
| 05 | `05-organization-calibration.html` | 3 Onboarding, 4 Role Spec, 5 Calibration | **Stage 3 — Calibration** |
| 06 | `06-sourcing-boolean-engine.html` | 6 Boolean Search, 7 CV Parsing | **Stage 4 — Sourcing** |
| 07 | `07-candidate-intelligence-profile.html` | 7 CV Parsing, 8 Candidate Review, 9 Ranking | **Stage 5 — Candidate intel** |
| 08 | `08-candidate-intelligence-comparison.html` | 8 Candidate Review, 9 Ranking, 12 Candidate Positioning | **Stage 5 — Candidate intel** |
| 09 | `09-shortlist-submission-builder.html` | 11 Shortlist, 12 Candidate Positioning | **Stage 6 — Shortlist & submit** |
| 10 | `10-hiring-manager-feedback-portal.html` | 10 Feedback | **Stage 7 — Feedback loop** |

## Stage summary

- **Stage 0 — Foundation**: auth, session, RLS-protected tenancy. No agents.
- **Stage 1 — Workspace shell**: app layout, project list, nav. Recruiter Copilot is the always-on assistant; Metrics powers the dashboard tiles.
- **Stage 2 — Role creation**: one-line role input → enriched role context. First agent chain (Intake → Company Research).
- **Stage 3 — Calibration**: must-haves, anti-patterns, scoring weights. Locks the role spec used by every downstream agent.
- **Stage 4 — Sourcing**: Boolean / X-Ray queries + CV ingestion pipeline. CV Parsing produces the structured profile feeding Stage 5.
- **Stage 5 — Candidate intel**: per-candidate review + cross-candidate comparison. Ranking writes the leaderboard; Positioning prepares narrative angles.
- **Stage 6 — Shortlist & submit**: build the slate, generate trade-off narrative for the hiring manager.
- **Stage 7 — Feedback loop**: hiring manager reactions → Feedback agent recalibrates weights → loop back into Stage 5/6.

## Not yet exported

The Stitch project also contains: Intelligence Interface Landing, Intelligence Tiers & Pricing, Candidate Deep-Dive, Search Calibration Sequence, System Settings & Workspace Admin (×2), Global Executive Network, Shortlist & Submission Builder v1, Hiring Manager Feedback Portal v1, Request System Access. Pull these into this folder if/when their stages come into scope.
