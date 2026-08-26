// The transcription seam's unit proofs (122, gate adbb05f §E): no key
// = honestly absent (a refusal sentence, no network call); with a key,
// the provider's text lands or its failure becomes a reader-facing
// sentence — never a silent retry.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { transcribeAudio, transcriptionAvailable } from "./transcribe";

const BYTES = new Uint8Array([1, 2, 3]);

describe("the key gate", () => {
  beforeEach(() => {
    delete process.env.DEEPINFRA_API_KEY;
  });

  it("reports unavailable and refuses with a sentence — no fetch happens", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(transcriptionAvailable()).toBe(false);
    await expect(
      transcribeAudio(BYTES, "audio/mpeg", "call.mp3")
    ).rejects.toThrow(/not configured/);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("with the key present", () => {
  beforeEach(() => {
    process.env.DEEPINFRA_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.DEEPINFRA_API_KEY;
    vi.restoreAllMocks();
  });

  it("returns the provider's trimmed text", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ text: "  hello from the call  " }), {
        status: 200,
      })
    );
    expect(transcriptionAvailable()).toBe(true);
    await expect(
      transcribeAudio(BYTES, "audio/mpeg", "call.mp3")
    ).resolves.toBe("hello from the call");
  });

  it("sends the key as a bearer and the file as multipart form data", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ text: "x" }), { status: 200 })
    );
    await transcribeAudio(BYTES, "audio/mpeg", "call.mp3");
    const [, init] = spy.mock.calls[0];
    expect(
      (init?.headers as Record<string, string>).Authorization
    ).toBe("Bearer test-key");
    expect(init?.body).toBeInstanceOf(FormData);
  });

  it("turns a provider refusal into a reader-facing sentence", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 429 })
    );
    await expect(
      transcribeAudio(BYTES, "audio/mpeg", "call.mp3")
    ).rejects.toThrow(/refused the request \(429\)/);
  });

  it("turns a network failure into a reader-facing sentence", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNRESET"));
    await expect(
      transcribeAudio(BYTES, "audio/mpeg", "call.mp3")
    ).rejects.toThrow(/could not be reached/);
  });

  it("refuses an empty or shapeless payload rather than saving a blank transcript", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ text: "   " }), { status: 200 })
    );
    await expect(
      transcribeAudio(BYTES, "audio/mpeg", "call.mp3")
    ).rejects.toThrow(/returned no text/);
  });
});
