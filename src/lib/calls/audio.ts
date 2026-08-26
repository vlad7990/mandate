/**
 * Call-audio validation — the pure half of the call-logging slice
 * (122, gate adbb05f). Mirrors the `call-audio` bucket's own limits so
 * a refused file gets a sentence before the bytes travel; the bucket's
 * mime/size rules remain the real enforcement.
 *
 * Client-safe data + pure functions only (the notes-constants rule:
 * "use server" files cannot export consts).
 */

export const MAX_AUDIO_BYTES = 52_428_800; // 50 MB — the bucket's limit

/** Mime → file extension. Keys are the bucket's allowed_mime_types. */
export const AUDIO_EXTENSIONS: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
};

/** The <input accept> string, derived so the two lists cannot drift. */
export const AUDIO_ACCEPT = Object.keys(AUDIO_EXTENSIONS).join(",");

export type AudioValidation =
  | { ok: true; extension: string }
  | { ok: false; reason: string };

export function validateAudioFile(file: {
  type: string;
  size: number;
}): AudioValidation {
  const extension = AUDIO_EXTENSIONS[file.type];
  if (!extension) {
    return {
      ok: false,
      reason:
        "That file type is not a supported call recording — use mp3, m4a, aac, wav, webm, or ogg.",
    };
  }
  if (file.size <= 0) {
    return { ok: false, reason: "The audio file is empty." };
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return {
      ok: false,
      reason: "The recording is over 50MB — trim or re-encode it first.",
    };
  }
  return { ok: true, extension };
}
