import { describe, expect, it } from "vitest";
import {
  BackupDecryptError,
  BackupKeyError,
  decrypt,
  encrypt,
  ENVELOPE_OVERHEAD,
  generateKeyBase64,
  parseKey,
} from "./crypto";
import {
  destinationPathFor,
  digestsMatch,
  manifestArchivePath,
  sha256Hex,
  verifyBytes,
} from "./integrity";
import {
  REASON_CAP,
  sanitiseFailure,
  sanitiseReason,
  summaryLine,
  toHeartbeatDetail,
} from "./report";
import { uriEncode, signRequest } from "./destination";
import { parseManifest, ManifestVersionError, ManifestCorruptError, emptyManifest } from "./manifest";
import type { BackupRunReport } from "./types";

const KEY = parseKey(Buffer.alloc(32, 7).toString("base64"));
const enc = (s: string) => new TextEncoder().encode(s);

describe("encryption at rest", () => {
  it("round-trips bytes", () => {
    const plain = new TextEncoder().encode("a candidate CV, notionally");
    const envelope = encrypt(plain, KEY);
    expect(Buffer.from(decrypt(envelope, KEY)).toString()).toBe(
      "a candidate CV, notionally"
    );
  });

  it("produces different ciphertext for identical input", () => {
    // This is why integrity digests are taken over plaintext: a fresh
    // nonce per object means a ciphertext digest would change every run
    // and make every object look modified.
    const plain = new TextEncoder().encode("same bytes");
    const a = encrypt(plain, KEY);
    const b = encrypt(plain, KEY);
    expect(Buffer.compare(a, b)).not.toBe(0);
    expect(Buffer.from(decrypt(a, KEY))).toEqual(Buffer.from(decrypt(b, KEY)));
  });

  it("rejects a wrong key rather than returning garbage", () => {
    const envelope = encrypt(new TextEncoder().encode("secret"), KEY);
    const other = parseKey(Buffer.alloc(32, 9).toString("base64"));
    expect(() => decrypt(envelope, other)).toThrow(BackupDecryptError);
  });

  it("detects tampering — a flipped byte fails authentication", () => {
    const envelope = encrypt(new TextEncoder().encode("secret"), KEY);
    envelope[envelope.length - 1] ^= 0xff;
    expect(() => decrypt(envelope, KEY)).toThrow(BackupDecryptError);
  });

  it("rejects a truncated envelope", () => {
    const envelope = encrypt(new TextEncoder().encode("secret"), KEY);
    expect(() => decrypt(envelope.subarray(0, ENVELOPE_OVERHEAD - 1), KEY)).toThrow(
      BackupDecryptError
    );
  });

  it("rejects an envelope without the magic header", () => {
    const fake = Buffer.alloc(64, 1);
    expect(() => decrypt(fake, KEY)).toThrow(/expected envelope format/);
  });

  it("handles empty and large payloads", () => {
    expect(decrypt(encrypt(new Uint8Array(0), KEY), KEY).length).toBe(0);
    const big = Buffer.alloc(1_000_000, 42);
    expect(Buffer.compare(decrypt(encrypt(big, KEY), KEY), big)).toBe(0);
  });
});

describe("key handling", () => {
  it("refuses a missing key with a reader-facing sentence", () => {
    expect(() => parseKey(undefined)).toThrow(BackupKeyError);
    expect(() => parseKey(undefined)).toThrow(/will not run/);
  });

  it("refuses a key of the wrong length", () => {
    expect(() => parseKey(Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
  });

  it("never includes the key value in an error", () => {
    const secret = Buffer.alloc(31, 3).toString("base64");
    try {
      parseKey(secret);
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as Error).message).not.toContain(secret);
    }
  });

  it("generates a usable key", () => {
    expect(parseKey(generateKeyBase64()).length).toBe(32);
  });
});

describe("integrity", () => {
  it("digests and verifies", () => {
    const bytes = new TextEncoder().encode("x");
    const digest = sha256Hex(bytes);
    expect(verifyBytes(bytes, digest)).toEqual({ ok: true });
    const bad = verifyBytes(new TextEncoder().encode("y"), digest);
    expect(bad.ok).toBe(false);
  });

  it("compares digests without throwing on malformed input", () => {
    expect(digestsMatch("zz", "zz")).toBe(false);
    expect(digestsMatch("ab", "abcd")).toBe(false);
    expect(digestsMatch("ab", "ab")).toBe(true);
  });

  it("gives a changed object a NEW destination path", () => {
    // So a corrupted upload cannot overwrite the only good copy.
    const a = destinationPathFor("cvs", "k.pdf", "a".repeat(64));
    const b = destinationPathFor("cvs", "k.pdf", "b".repeat(64));
    expect(a).not.toBe(b);
    expect(a).toContain("objects/cvs/k.pdf");
  });

  it("produces a filesystem-safe manifest archive path", () => {
    const p = manifestArchivePath("2026-10-07T12:00:00.000Z");
    expect(p.startsWith("manifest/archive/")).toBe(true);
    // Colons are the actual portability problem — illegal in Windows
    // paths and awkward in object keys. The `.json` suffix is fine, so
    // only the filename stem is checked.
    const stem = p.slice("manifest/archive/".length, -".json".length);
    expect(stem).not.toMatch(/[:.]/);
    expect(stem).toBe("manifest-2026-10-07T12-00-00-000Z");
  });
});

describe("report sanitisation — requirement 9", () => {
  it("redacts URL userinfo", () => {
    expect(sanitiseReason("failed https://user:supersecret@host/x")).not.toContain(
      "supersecret"
    );
  });

  it("redacts AWS-style access key ids", () => {
    expect(sanitiseReason("AKIAIOSFODNN7EXAMPLE denied")).toContain("[redacted-key-id]");
  });

  it("redacts long opaque secrets", () => {
    const secret = "k".repeat(48);
    expect(sanitiseReason(`auth failed for ${secret}`)).not.toContain(secret);
  });

  it("redacts self-labelled credentials", () => {
    expect(sanitiseReason("secret_access_key=abc123xyz")).toContain("[redacted]");
    expect(sanitiseReason("Authorization: Bearer abc.def.ghi")).not.toContain("abc.def.ghi");
  });

  it("redacts a signature", () => {
    expect(sanitiseReason(`Signature=${"a".repeat(64)}`)).toContain("Signature=[redacted]");
  });

  it("caps length so unanticipated content cannot leak past the fold", () => {
    const cv = "Experienced CTO with a peanut allergy. ".repeat(50);
    const out = sanitiseReason(cv);
    expect(out.length).toBeLessThanOrEqual(REASON_CAP + 20);
    expect(out).toContain("[truncated]");
  });

  it("collapses newlines so nothing hides below a log line", () => {
    expect(sanitiseReason("line1\nline2\nline3")).toBe("line1 line2 line3");
  });

  it("never leaves an empty reason", () => {
    expect(sanitiseReason("")).toBe("no detail");
    expect(sanitiseReason(undefined)).toBe("no detail");
  });

  it("sanitises a single failure directly", () => {
    const out = sanitiseFailure({
      bucket: "cvs",
      key: "org/a.pdf",
      kind: "upload_failed",
      reason: "denied for AKIAIOSFODNN7EXAMPLE",
    });
    expect(out.key).toBe("org/a.pdf");
    expect(out.reason).toContain("[redacted-key-id]");
  });

  it("sanitises failures carried into the heartbeat", () => {
    const detail = toHeartbeatDetail(reportWith({
      failures: [
        { bucket: "cvs", key: "a.pdf", kind: "upload_failed", reason: "AKIAIOSFODNN7EXAMPLE" },
      ],
    }));
    expect(detail.failureSample[0].reason).toContain("[redacted-key-id]");
  });

  it("caps the failure sample so a systemic failure writes a small row", () => {
    const failures = Array.from({ length: 50 }, (_, i) => ({
      bucket: "cvs" as const,
      key: `a${i}.pdf`,
      kind: "upload_failed" as const,
      reason: "nope",
    }));
    const detail = toHeartbeatDetail(reportWith({ failures }));
    expect(detail.failureCount).toBe(50);
    expect(detail.failureSample).toHaveLength(10);
  });

  it("keeps object keys — an operator cannot restore without them", () => {
    const detail = toHeartbeatDetail(reportWith({
      failures: [{ bucket: "cvs", key: "org/needed.pdf", kind: "source_missing", reason: "x" }],
    }));
    expect(detail.failureSample[0].key).toBe("org/needed.pdf");
  });

  it("writes an honest one-line summary", () => {
    const line = summaryLine(reportWith({ outcome: "partial", copied: 3, budgetExhausted: true }));
    expect(line).toContain("outcome=partial");
    expect(line).toContain("budget_exhausted=true");
  });
});

describe("manifest version gate", () => {
  it("accepts the current version", () => {
    const m = emptyManifest("2026-10-07T00:00:00.000Z");
    expect(parseManifest(JSON.stringify(m)).version).toBe(1);
  });

  it("refuses an unknown version rather than guessing", () => {
    expect(() => parseManifest(JSON.stringify({ version: 99, entries: [] }))).toThrow(
      ManifestVersionError
    );
  });

  it("refuses invalid JSON rather than silently starting fresh", () => {
    // Starting fresh would orphan every object already stored.
    expect(() => parseManifest("{not json")).toThrow(ManifestCorruptError);
  });

  it("refuses a manifest with no entries array", () => {
    expect(() => parseManifest(JSON.stringify({ version: 1 }))).toThrow(ManifestCorruptError);
  });

  it("tolerates a manifest missing newer optional fields", () => {
    const m = parseManifest(JSON.stringify({ version: 1, entries: [], updatedAt: "x" }));
    expect(m.suppressedKeys).toEqual([]);
    expect(m.lastRunFailures).toEqual([]);
  });
});

describe("SigV4 signing", () => {
  it("preserves slashes in a path but encodes them in a query value", () => {
    expect(uriEncode("a/b c", true)).toBe("a/b%20c");
    expect(uriEncode("a/b c", false)).toBe("a%2Fb%20c");
  });

  it("leaves unreserved characters alone", () => {
    expect(uriEncode("Aa0-._~", false)).toBe("Aa0-._~");
  });

  it("produces a deterministic signature for fixed inputs", () => {
    const url = new URL("https://example.r2.cloudflarestorage.com/bucket/objects/x.enc");
    const a = signRequest({
      method: "PUT",
      url,
      region: "auto",
      accessKeyId: "AKIAEXAMPLE",
      secretAccessKey: "secret",
      payloadHash: sha256Hex(enc("body")),
      amzDate: "20261007T120000Z",
    });
    const b = signRequest({
      method: "PUT",
      url,
      region: "auto",
      accessKeyId: "AKIAEXAMPLE",
      secretAccessKey: "secret",
      payloadHash: sha256Hex(enc("body")),
      amzDate: "20261007T120000Z",
    });
    expect(a.authorization).toBe(b.authorization);
    expect(a.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE\/20261007\/auto\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
  });

  it("changes the signature when the payload changes", () => {
    const url = new URL("https://host/bucket/k");
    const common = {
      method: "PUT",
      url,
      region: "auto",
      accessKeyId: "A",
      secretAccessKey: "s",
      amzDate: "20261007T120000Z",
    };
    const a = signRequest({ ...common, payloadHash: sha256Hex(enc("one")) });
    const b = signRequest({ ...common, payloadHash: sha256Hex(enc("two")) });
    expect(a.authorization).not.toBe(b.authorization);
  });

  it("never puts the secret key in the headers", () => {
    const headers = signRequest({
      method: "GET",
      url: new URL("https://host/b/k"),
      region: "auto",
      accessKeyId: "A",
      secretAccessKey: "THE-SECRET-VALUE",
      payloadHash: sha256Hex(enc("")),
      amzDate: "20261007T120000Z",
    });
    expect(JSON.stringify(headers)).not.toContain("THE-SECRET-VALUE");
  });
});

function reportWith(partial: Partial<BackupRunReport>): BackupRunReport {
  return {
    startedAt: "2026-10-07T12:00:00.000Z",
    finishedAt: "2026-10-07T12:00:01.000Z",
    durationMs: 1000,
    outcome: "complete",
    reason: null,
    planned: null,
    copied: 0,
    bytesCopied: 0,
    forgotten: 0,
    failures: [],
    budgetExhausted: false,
    manifestVersion: 1,
    runCount: 1,
    ...partial,
  };
}
