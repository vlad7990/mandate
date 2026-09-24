# Skills studio

Standing instructions that are spliced into the agents' prompts on every
run — how this desk works, said once, instead of re-explained in every
brief.

## What you do here

1. Read the active count: every active skill rides every agent run.
2. **New Skill** — name it, choose its reach (**Search** for the whole
   organisation, **Client** for one client's work, **Role** for a single
   mandate), say when it should apply, and write the instruction.
3. Watch the preview as you type — it shows the block as the agent will
   receive it.
4. **Pause** a skill that is causing trouble rather than deleting it;
   **Edit** to refine the wording.

## What done looks like

The instructions you keep repeating to the agents are written down once
and active, and the next agent run obeys them.

## What this screen will not do

**Changes apply to the next agent run, never to work already done.** An
existing report keeps the prompt it was generated against — that is
deliberate, so a past judgment stays explainable.

The preview is close but not exact: the real prompt adds framing the
preview does not show, and on a live run **every** active skill in scope
arrives together, not just the one you are editing. There is no view of
what will actually fire as a set, and no dry run against a real
candidate.

Trigger conditions are advisory. The model reads them and decides
whether the skill applies — they are not a deterministic filter.

There is no version history, no diff, no undo on delete, and no count of
how often a skill was used. Length limits (4,000 characters of
instruction) are enforced when you save rather than shown as you type.
Authoring needs `skills:write`, which only an admin holds; the trail
records that a skill changed but never the text of the instruction.

## Where this leads

To **Agents**, to see who reads these instructions and what each one is
forbidden to decide.
