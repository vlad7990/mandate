# Judgment harness (§185)

The first falsifiable test of the system's judgment: the runner is
machine-written, the verdicts are yours, and neither half can see the
other while working.

## The one-hour version of §128

1. **Drop 8–10 real CVs** (PDF/DOCX) into `evals/fixtures/cvs/`
   (gitignored — they never leave your machine except to the model).
2. **Create a THROWAWAY mandate in the app** — a real one-liner, so
   intake builds a real calibration. Never point the harness at a live
   client mandate. Copy the project id from the URL.
3. **Ingest** (dry-run prints the cost estimate and stops):

   ```sh
   HARNESS_PROJECT=<project-id> \
   HARNESS_EMAIL=<your login> HARNESS_PASSWORD=<your password> \
   npm run harness
   ```

   Add `HARNESS_CONFIRM=yes` to actually run. `HARNESS_LIMIT=n` caps the
   batch. ~3 model calls per CV, sequential, a few minutes each.
4. **Fill the sheet** — `evals/judgment-harness/output/judgment-sheet.md`.
   Every `> ` line is yours: agree yes/no, your tier 1–4, would you
   present, your rank across the slate, notes. The candidates are also
   live in the app under the throwaway mandate — read the full reports
   there before answering.
5. **Score**:

   ```sh
   HARNESS_CMD=score npm run harness
   ```

   The report lists concordance, rank correlation, and every
   disagreement verbatim. **The disagreements are the finding.**
6. **Teardown** (when you have finished reading — not before):

   ```sh
   HARNESS_CMD=teardown \
   HARNESS_EMAIL=<your login> HARNESS_PASSWORD=<your password> \
   npm run harness
   ```

   Removes the harness's candidates and files. The throwaway project
   and the agents' trail events remain — real history of a real run;
   delete the project from the app yourself.

## What it does and does not do

- Drives the LIVE seams in production under your own session and RLS —
  no mocks, no service key. The parse, evaluation and refuter that run
  are exactly the ones a real upload gets, including §177's door.
- Runs on the ruled capability map (`MANDATE_EVAL=1`), so a live
  registry override is not exercised.
- Everything under `output/` is gitignored: the sheet contains your
  judgments about real people and must never be committed.
