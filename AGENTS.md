# Mandate — Agent Configuration

## Agent Runtime
- Model: claude-sonnet-4-6
- All agents use the Anthropic Claude API
- Agents are stateless — full context passed on each call
- Memory layer: Supabase (persistent state between sessions)

## The 17 Mandate Agents

14 core agents plus the 3 Executive Intelligence agents below. This
heading said "14" while the document listed 17, which is where the
14-vs-17 drift on the marketing surface originated. The count is now
derived in code from `src/app/(marketing)/_data/agents.ts`, whose roster
mirrors this file — add an agent in both places.

### 1. Intake Agent
Trigger: One-line role input
Output: Role structure, inferred scope, missing info, onboarding trigger

### 2. Company Research Agent  
Trigger: Company name from role input
Output: Industry, business model, org structure, tech maturity, regulatory env

### 3. Onboarding Agent
Trigger: After company research
Output: Dynamic questionnaire, captures must-haves, anti-patterns, priorities

### 4. Role Spec Agent
Trigger: Onboarding complete
Output: AI-generated job spec, version controlled, recruiter editable

### 5. Calibration Agent
Trigger: Onboarding data + role spec finalised
Output: Scoring model with dimension weights

### 6. Boolean Search Agent
Trigger: Calibration complete
Output: LinkedIn Boolean, Google X-Ray, ATS queries (exact/broad/adjacent)

### 7. CV Parsing Agent
Trigger: PDF or DOCX uploaded
Output: Structured candidate profile (roles, domain, scale, tech, archetypes)

### 8. Candidate Review Agent
Trigger: CV parsed
Output: Summary, strengths, weaknesses, risks, fit vs role

### 9. Ranking Agent
Trigger: Candidate reviewed
Output: Multi-dimension score, tier assignment, leaderboard position

### 10. Feedback Agent
Trigger: Recruiter or hiring manager submits feedback
Output: Interpreted preference changes, bias flags, contradictions detected

### 11. Shortlist Agent
Trigger: Ranking complete or feedback recalibration done
Output: Top 3/5/custom slate with trade-off analysis

### 12. Candidate Positioning Agent
Trigger: Candidate selected for submission
Output: Narrative improvement, perception analysis, gap identification

### 13. Recruiter Copilot Agent
Trigger: Ongoing — always available
Output: Answers questions, suggests next actions, explains decisions

### 14. Metrics / Search Health Agent
Trigger: Scheduled + on-demand
Output: Pipeline health, funnel conversion, stalled search alerts

## Executive Intelligence Module Agents (premium)

See docs/executive-intelligence.md for the module plan and guardrails.
All output from these agents is decision support — human review and
explicit approval are required before any artifact is used.

### 15. Company Context Agent
Trigger: Executive search created (or research retry)
Output: Company operating context for executive due diligence — stage/scale demands, regulatory and governance environment, key stakeholders, recent events (web_search-grounded)

### 16. Executive Role Architect Agent
Trigger: Success Profile generation requested (explicit user click)
Output: Versioned Executive Success Profile — role mission, mandate, outcomes, required capabilities/experience/scale, derailers, gaps, competency weights, interview stages. Stored with prompt/model version; approval is a human action

### 17. Interview Architect Agent
Trigger: Interview plan generation requested for a linked candidate (explicit user click; requires an approved Success Profile)
Output: Versioned per-candidate interview plan — stages with objective, interviewer role, duration, assigned competencies, core/follow-up/candidate-specific questions, evidence to listen for, weak-answer indicators, red flags; plus server-computed competency coverage. No hire/no-hire verdicts. Stored with prompt/model version; approval is a human action

## Agent Communication Pattern
All agents read from and write to Supabase.
No direct agent-to-agent calls in MVP.
Orchestration is handled by the application layer.
## Architecture Vocabulary (doctrine, 2026-08-25)

Five concepts, kept distinct. When building something new, name which
one it is before writing code — do not create a new Skill when the
need is a service or capability, and never add a principal merely to
implement a reusable function.

- **Agent** — a bounded AI principal: its own database identity,
  credential, RLS reach, kill switch, and name in the activity
  trail. An agent defines WHO is judging and what it may touch.
- **Capability** — an engineering-owned function an agent performs:
  inputs, outputs, allowed reads/writes, tools, deterministic
  constraints, human gates. Defined in code and migrations, proven
  by harnesses; never customer-editable.
- **Skill** — an admin-authored runtime instruction (Skills Studio).
  Skills may steer judgment — tone, emphasis, framing, criteria.
  Skills may NEVER expand authority: no new data access, no new
  tools, no wider disclosure, no bypassed gate. Scope filtering is
  deterministic; trigger conditions are model-interpreted and the UI
  says so. Every skill change is evented and versioned
  (skill_versions, append-only).
- **Deterministic Policy** — application/database enforcement that
  neither agents nor skills can override: RLS, org scope, DNC and
  suppression, disclosure and compensation clamps, Art. 14
  machinery, editorial pins, autonomy limits, human approval gates.
  Policy always outranks model instructions.
- **Workflow** — application-layer orchestration across agents and
  capabilities (the future Mandate Scout). Agents do not call
  agents; skills do not trigger workflows; the application owns
  progression and every gate crossing.
