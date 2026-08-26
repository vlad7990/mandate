// The call-audio validation's unit proofs (122, gate adbb05f): the
// pure mirror of the bucket's own limits, so a refused file gets a
// sentence before any bytes travel.

import { describe, expect, it } from "vitest";
import {
  AUDIO_ACCEPT,
  AUDIO_EXTENSIONS,
  MAX_AUDIO_BYTES,
  validateAudioFile,
} from "./audio";

describe("validateAudioFile", () => {
  it("accepts every bucket mime type and names its extension", () => {
    for (const [mime, ext] of Object.entries(AUDIO_EXTENSIONS)) {
      const verdict = validateAudioFile({ type: mime, size: 1024 });
      expect(verdict).toEqual({ ok: true, extension: ext });
    }
  });

  it("refuses a non-audio mime with a sentence", () => {
    const verdict = validateAudioFile({ type: "application/pdf", size: 1024 });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/not a supported/);
  });

  it("refuses an empty file and an oversized file", () => {
    expect(validateAudioFile({ type: "audio/mpeg", size: 0 }).ok).toBe(false);
    expect(
      validateAudioFile({ type: "audio/mpeg", size: MAX_AUDIO_BYTES + 1 }).ok
    ).toBe(false);
    // The boundary itself is legal — the limit mirrors the bucket's.
    expect(
      validateAudioFile({ type: "audio/mpeg", size: MAX_AUDIO_BYTES }).ok
    ).toBe(true);
  });

  it("derives the accept string from the same list, so the two cannot drift", () => {
    for (const mime of Object.keys(AUDIO_EXTENSIONS)) {
      expect(AUDIO_ACCEPT).toContain(mime);
    }
  });
});
