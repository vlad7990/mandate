# CALL LOGGING — CHEAP FIRST SLICE GATE — AUDIO + TRANSCRIPT ON CALL NOTES — 2026-08-25 — DRAFT

**Status: Phase-0-verified gate DRAFT. Nothing is built. Build
starts only on the founder's written word against THIS document.
Ruled frame (founder, 2026-08-25, recorded in memory): live
telephony is DEFERRED — "Twilio is down"; when it returns it gates
separately, with a real consent flow and its own webhook route.
This slice is the cheap half: recruiters call on their own phones,
and the app captures the call — typed notes (which already exist),
plus an audio attachment and an optional transcript.**

---

## A. What this slice is

The "log a call" surfaces already exist as typed entry; what is
genuinely new is: (1) an **audio attachment** on a call note —
candidate or client — stored org-scoped like CVs; (2) a
**consent-confirmed** door in front of every attachment, structural
not procedural; (3) an **optional transcript** produced by an ASR
provider behind a founder-owned key, degrading honestly to
"attachment only" when no key exists. Claude does no audio — the
ASR is a new provider class, and its provisioning is a money act
that stays with the founder (decision J.1).

## B. Phase 0 — verified facts the design stands on

1. **The typed half is BUILT.** `candidate_notes` (020):
   `note_type` CHECK includes `'call'`, `call_duration_minutes`
   column, pinning, org-scoped RLS FOR ALL; the candidate page's
   notes-panel already offers "Start call notes" with type +
   duration. `client_notes` (054): `note_type` includes `'call'`
   (no duration — 054's own comment rules that asymmetry);
   client-notes-panel live on the client page. Both are
   session-authored under org RLS; neither writes the activity
   trail (053's design: trails record what leaves the building or
   changes authority — a private note does neither).
2. **The storage precedent is exact.** The `cvs` bucket (014):
   private, 10MB, mime-allowlisted, seeded `ON CONFLICT DO UPDATE`;
   three policies on `storage.objects` anchored on
   `(storage.foldername(name))[1] = current_user_org_id()` — the
   org id is the first path segment. Upload happens in the server
   action through the SESSION client, so storage RLS is the
   enforcement (`candidates/actions.ts:122`). Storage deletes are
   API-only (the standing teardown trap — SQL deletes are
   trigger-blocked).
3. **LATENT DEFECT, named:** `next.config.ts` sets no
   `serverActions.bodySizeLimit`; the Next.js default is 1MB.
   The CV action accepts files up to the bucket's 10MB — anything
   over ~1MB through the action should 413 today. §128's
   real-CV testing (founder half, open) would have hit this. The
   slice raises the limit and fixes the CV ceiling in passing.
4. **ASR discovery run** (marketplace flow, read-only): the
   Vercel marketplace `ai` category surfaces exactly one
   integration — **Deep Infra** (API-token native integration,
   unified Vercel billing), which hosts Whisper-class speech-to-
   text. Per the discover-top rule it is the recommendation;
   Deepgram/OpenAI direct are the off-marketplace alternates
   (separate account + key each). No provider is provisioned —
   that is J.1.
5. **Trail state:** CHECK 89, door 22, allowlist 29, roster 12 —
   none of them move this slice (G below).

## C. Migration 122 — `122_call_audio.sql`

**The bucket.** `call-audio`: private, `file_size_limit` 50MB
(~90 min of m4a — decision J.3), `allowed_mime_types` =
audio/mpeg, audio/mp4, audio/x-m4a, audio/aac, audio/wav,
audio/webm, audio/ogg. Seeded on the 014 shape. Three
`storage.objects` policies (read/insert/delete), copied from the
cvs trio verbatim: org id is the first path segment. Paths:
`{orgId}/candidate-notes/{noteId}.{ext}` and
`{orgId}/client-notes/{noteId}.{ext}`.

**Note columns — both tables** (`candidate_notes`,
`client_notes`), same four:

- `audio_path` text — the storage path; NULL = no attachment.
- `consent_confirmed` boolean NOT NULL DEFAULT false.
- `transcript` text — the ASR's output, never recruiter-authored.
- `transcript_error` text — the honest failure sentence
  (`generation_error` precedent).

**Structural doors** (table CHECKs, no triggers needed):

- `audio_path IS NULL OR consent_confirmed` — audio cannot attach
  without the consent attestation. Two-party-consent law is the
  founder's obligation; the schema's job is to make the claim
  recorded, not skippable.
- `audio_path IS NULL OR note_type = 'call'` — attachments are a
  call-note thing; a "general" note with a recording would be a
  recording pretending to be something else.
- `(transcript IS NULL AND transcript_error IS NULL) OR audio_path
  IS NOT NULL` — no transcript without audio behind it.

RLS: UNCHANGED — the new columns ride each table's existing
org-scoped policy. No new principals, no new grants, anon roster
stays TWELVE. No SECURITY DEFINER functions (the 121 lesson has
nothing to bite here).

## D. Upload and playback

The call-note create action (both panels) gains an optional file
input, gated by a consent checkbox — the checkbox is disabled-off
by default and the file input stays disabled until it is ticked
(the CHECK refuses anyway; the UI just doesn't offer the illegal
move, the registry-console pattern). Flow: insert the note row →
upload through the SESSION client (storage RLS enforces org) →
stamp `audio_path`. Upload failure keeps the note and surfaces the
sentence — a typed note is not hostage to its attachment.
Playback: a signed URL minted server-side per view (private
bucket), rendered as a plain `<audio>` element in the note row.
`next.config.ts` gains `serverActions.bodySizeLimit: "50mb"` —
which also releases the latent CV ceiling (B.3).

## E. Transcription — founder-keyed, honestly absent otherwise

- **Provider (J.1):** recommend **Deep Infra** via the marketplace
  (`vercel integration add deepinfra` — unified billing, injects
  its key env var), running `openai/whisper-large-v3`. The
  founder's word provisions it; the session never handles the key.
  Alternates if the founder prefers: Deepgram or OpenAI direct.
- **The seam:** one server module (`src/lib/calls/transcribe.ts`)
  reads the key env var BY NAME. Key absent → the UI shows no
  transcribe affordance and the module refuses with one honest
  sentence if reached — attachment-only mode, no fake transcripts,
  no pending states that never resolve.
- **The action:** "Transcribe" on a note that has audio and no
  transcript. Reads the audio through the session client (org RLS
  proves the right), sends bytes to the ASR, writes `transcript` —
  or `transcript_error` with the honest sentence (090: human
  bookkeeping, failure recorded on the row, never retried
  silently).
- **Boundary law (Part N's spirit):** the ASR receives audio bytes
  and returns text; it never holds a Supabase client; the
  transcript lands as DATA on the note — it feeds no AI loop, no
  trail, no recalibration this slice. If a later slice wants
  Copilot to read call transcripts, that gates separately.
- This is NOT the model registry's business: the registry governs
  Anthropic-shaped inference capabilities behind `runInference()`;
  an ASR is a different organ. It does NOT enter `model_providers`
  (J.2).

## F. UI

Both notes panels, minimal extension in place: consent checkbox +
file input on the call-note form; an audio player + transcript
block (labelled "Transcript — machine-generated") on notes that
have them; a Transcribe button only when the key exists and no
transcript does. Terminal visual language. No new routes, no
route-access changes, no proxy changes — everything lives on
existing candidate/client pages behind existing capabilities.

## G. The trail — deliberately unchanged

Notes have never ridden the activity trail (053's design), and a
call note with an attachment is still a private note. CHECK stays
89, door stays 22, `record_agent_event` stays 29. If the founder
wants "recording attached" to be an org-visible act, that is a
one-line ruling for a later gate — the default here is no.

## H. Tests + green gate

- Unit: transcribe module — key-absent refusal (honest sentence,
  no call), success path (mocked fetch), failure → error sentence;
  note actions — consent refusal surfaced, upload-failure keeps
  the note.
- The CHECK doors are proven live in the drive (SQL probes), the
  smoke pattern of 120.
- Green gate: tsc · vitest (1044 + new) · eslint · build · commit
  · deploy (`vercel deploy --prod --yes`).

## I. Drive 108 — live proof, then teardown by value

1. Candidate call note WITH audio: tick consent, attach a small
   generated WAV, note lands, `audio_path` stamped, player renders
   a signed URL. Same once on the client side.
2. Refusals: SQL probe — audio_path without consent REFUSED by the
   CHECK; audio on a `general` note REFUSED; oversized/wrong-mime
   upload refused by the bucket. UI never offered any of them.
3. Transcription: if the founder has provisioned Deep Infra by
   drive time, transcribe the WAV live and verify the transcript
   column + rendering; if not, prove the HONEST ABSENCE — no
   affordance, module refuses with the sentence (the null result
   is a pass, the 142 precedent).
4. Teardown by value: the drive's note rows; the storage objects
   VIA THE API (the standing trap); localStorage + cookies.
   Fresh-statement baseline after: unchanged everywhere —
   candidate_notes 0 durable? (VERIFY at drive start: the baseline
   has never counted candidate_notes/client_notes; count them
   before touching, restore to that count.)

## J. Decisions requiring the founder's word

1. **ASR provider**: Deep Infra via marketplace (recommended —
   discover-top, unified billing, one key) — provisioning is YOUR
   act, before or after the build (the feature degrades honestly
   without it). Or name Deepgram/OpenAI direct instead.
2. **The ASR stays OUT of the model registry** (`model_providers`
   remains Anthropic-shaped inference only). Confirm?
3. **50MB / ~90min audio cap** and the seven audio mime types.
   Confirm or resize?
4. **Consent as attestation**: a required checkbox recorded on the
   row (`consent_confirmed`), CHECK-enforced — the slice records
   the claim; the legal obligation stays yours. Confirm?
5. **Trail unchanged** (G) — attachments are private-note
   material, no new intents. Confirm?
6. **`bodySizeLimit: "50mb"`** on server actions globally (also
   unblocks >1MB CV uploads). Confirm?

---

Numbers at drafting (post-§154): next migration 122 · next § 155 ·
next drive 108 · vitest 1044 · CHECK 89 / door 22 / allowlist 29 /
roster 12 · durable baseline holds the §153 registry gains;
candidate_notes/client_notes counts to be pinned at drive start.
D-ladder on the word: migration 122 · bodySizeLimit · upload +
playback · transcribe seam (key-gated) · panel extensions · unit
tests · green gate · commit · deploy · drive 108 · §155 DRAFTED,
no completion declared · memory updated.
