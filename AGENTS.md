# Mandate — Agent Configuration

## Agent Runtime
- Model: claude-sonnet-4-6
- All agents use the Anthropic Claude API
- Agents are stateless — full context passed on each call
- Memory layer: Supabase (persistent state between sessions)

## The 14 Mandate Agents

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

## Agent Communication Pattern
All agents read from and write to Supabase.
No direct agent-to-agent calls in MVP.
Orchestration is handled by the application layer.