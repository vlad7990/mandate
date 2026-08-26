import "server-only";

/**
 * The transcription seam (call-logging slice, gate adbb05f §E).
 *
 * One ASR provider behind ONE founder-owned key, read by env-var NAME —
 * the key never enters the database or the client bundle. No key = the
 * feature is honestly absent: the UI shows no transcribe affordance
 * (callers ask `transcriptionAvailable()` server-side), and this module
 * refuses with a plain sentence if reached anyway. No fake transcripts,
 * no pending states that never resolve.
 *
 * Boundary law (Part N's spirit, and 054's Art. 14 note): the ASR
 * receives audio bytes and returns text; it never holds a Supabase
 * client. The transcript lands as DATA on the note — it feeds no AI
 * loop, no trail, no recalibration this slice. If call transcripts are
 * ever fed to an agent, that analysis is redone first, behind its own
 * gate.
 *
 * Provider: Deep Infra (marketplace discover-top, gate J.1) running
 * Whisper via its OpenAI-compatible transcription endpoint. The
 * provisioning is the founder's act; until the key exists in Vercel,
 * every deployment runs attachment-only.
 */

const KEY_ENV_VAR = "DEEPINFRA_API_KEY";
const ENDPOINT = "https://api.deepinfra.com/v1/openai/audio/transcriptions";
const MODEL = "openai/whisper-large-v3";

export function transcriptionAvailable(): boolean {
  return !!process.env[KEY_ENV_VAR];
}

/**
 * Transcribe one recording. Throws plain `Error`s with reader-facing
 * sentences — callers record them in `transcript_error` (the
 * generation_error precedent) rather than retrying silently.
 */
export async function transcribeAudio(
  bytes: Uint8Array,
  mimeType: string,
  filename: string
): Promise<string> {
  const key = process.env[KEY_ENV_VAR];
  if (!key) {
    throw new Error(
      "Transcription is not configured — the recording stays attached, and transcripts switch on when the provider key is added."
    );
  }

  const form = new FormData();
  form.append("file", new Blob([bytes as BlobPart], { type: mimeType }), filename);
  form.append("model", MODEL);

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
  } catch {
    throw new Error(
      "The transcription provider could not be reached. The recording is unaffected — try again."
    );
  }

  if (!response.ok) {
    throw new Error(
      `The transcription provider refused the request (${response.status}). The recording is unaffected.`
    );
  }

  const payload: unknown = await response.json().catch(() => null);
  const text =
    payload &&
    typeof payload === "object" &&
    "text" in payload &&
    typeof (payload as { text: unknown }).text === "string"
      ? (payload as { text: string }).text.trim()
      : "";

  if (!text) {
    throw new Error(
      "The transcription provider returned no text for this recording."
    );
  }
  return text;
}
