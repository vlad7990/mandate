/**
 * The backup destination.
 *
 * Requirement 3 is explicit: the destination must be independently
 * recoverable, "not merely another bucket in the same project". So the
 * production adapter speaks S3 — which reaches Cloudflare R2, AWS S3 and
 * Backblaze B2 through one implementation — and the local adapter exists
 * only for tests and the restore rehearsal.
 *
 * ## Why SigV4 is implemented here rather than imported
 *
 * This module needs five S3 operations: PUT, GET, HEAD, LIST, DELETE.
 * `@aws-sdk/client-s3` is tens of megabytes of bundle for that, inside a
 * serverless function, in a repository that has kept itself to twenty
 * runtime dependencies. SigV4 is a well-specified algorithm, it is
 * exercised by its own tests below, and it costs about eighty lines. On
 * balance the smaller choice is the one that adds no dependency.
 *
 * The risk is real and worth naming: hand-rolled signing fails in
 * obscure ways against a specific vendor. That is why `verifyAccess()`
 * exists and why the activation steps require a one-object round trip
 * against the real bucket before the job is scheduled.
 *
 * ## Credentials
 *
 * Requirement 4 wants restricted credentials. The destination key needs
 * exactly PutObject, GetObject, HeadObject, ListBucket and DeleteObject
 * on one bucket prefix — not account-wide access, and emphatically not a
 * key that can delete the bucket. The activation steps state the policy.
 */

import { createHash, createHmac } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export type DestinationObject = {
  path: string;
  size: number;
};

/**
 * Everything the runner needs from a destination. Deliberately small:
 * no streaming, no multipart. Objects are capped at 50 MB by the source
 * buckets, which fits a single request comfortably, and adding multipart
 * would be complexity for a case that cannot occur.
 */
export type Destination = {
  readonly kind: "local" | "s3";
  /** Human-readable, for reports. Must never contain a credential. */
  readonly label: string;
  put(objectPath: string, bytes: Uint8Array): Promise<void>;
  get(objectPath: string): Promise<Uint8Array | null>;
  head(objectPath: string): Promise<DestinationObject | null>;
  list(prefix: string): Promise<DestinationObject[]>;
  delete(objectPath: string): Promise<void>;
  /** Round-trip proof that credentials and permissions actually work. */
  verifyAccess(): Promise<{ ok: boolean; detail: string }>;
};

// ---------------------------------------------------------------------------
// Local filesystem — tests and the restore rehearsal only.
// ---------------------------------------------------------------------------

export function createLocalDestination(rootDir: string): Destination {
  const resolve = (objectPath: string) => {
    // Refuse traversal: an object key comes from storage metadata, which
    // is not a trust boundary we want to lean on.
    const full = path.resolve(rootDir, objectPath);
    const root = path.resolve(rootDir);
    if (full !== root && !full.startsWith(root + path.sep)) {
      throw new Error(`Refusing to write outside the backup root: ${objectPath}`);
    }
    return full;
  };

  return {
    kind: "local",
    label: `local:${rootDir}`,
    async put(objectPath, bytes) {
      const full = resolve(objectPath);
      await fs.mkdir(path.dirname(full), { recursive: true });
      // Write-then-rename, so an interrupted run never leaves a
      // half-written object that a later run would trust.
      const tmp = `${full}.partial`;
      await fs.writeFile(tmp, bytes);
      await fs.rename(tmp, full);
    },
    async get(objectPath) {
      try {
        return new Uint8Array(await fs.readFile(resolve(objectPath)));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },
    async head(objectPath) {
      try {
        const st = await fs.stat(resolve(objectPath));
        return { path: objectPath, size: st.size };
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },
    async list(prefix) {
      const base = resolve(prefix);
      const out: DestinationObject[] = [];
      async function walk(dir: string) {
        let items;
        try {
          items = await fs.readdir(dir, { withFileTypes: true });
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
          throw err;
        }
        for (const it of items) {
          const full = path.join(dir, it.name);
          if (it.isDirectory()) await walk(full);
          else if (!it.name.endsWith(".partial")) {
            const st = await fs.stat(full);
            out.push({
              path: path.relative(path.resolve(rootDir), full),
              size: st.size,
            });
          }
        }
      }
      await walk(base);
      return out;
    },
    async delete(objectPath) {
      try {
        await fs.unlink(resolve(objectPath));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
    },
    async verifyAccess() {
      try {
        await fs.mkdir(rootDir, { recursive: true });
        const probe = ".mandate-backup-probe";
        await this.put(probe, new TextEncoder().encode("ok"));
        const back = await this.get(probe);
        await this.delete(probe);
        return back
          ? { ok: true, detail: "local round trip succeeded" }
          : { ok: false, detail: "local probe wrote but did not read back" };
      } catch (err) {
        return { ok: false, detail: `local destination unusable: ${String(err)}` };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// S3-compatible — Cloudflare R2, AWS S3, Backblaze B2.
// ---------------------------------------------------------------------------

export type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Optional key prefix, so one bucket can hold several environments. */
  prefix?: string;
};

function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

/** RFC 3986 encoding; S3 requires `/` preserved in the canonical path. */
export function uriEncode(value: string, preserveSlash: boolean): string {
  let out = "";
  for (const ch of Buffer.from(value, "utf8")) {
    const c = String.fromCharCode(ch);
    if (/[A-Za-z0-9\-._~]/.test(c)) out += c;
    else if (c === "/" && preserveSlash) out += c;
    else out += `%${ch.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return out;
}

/**
 * Exported for its tests. Produces the Authorization header value and
 * the headers SigV4 requires, given an already-hashed payload.
 */
export function signRequest(args: {
  method: string;
  url: URL;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  payloadHash: string;
  amzDate: string;
  extraHeaders?: Record<string, string>;
}): Record<string, string> {
  const { method, url, region, accessKeyId, secretAccessKey, payloadHash, amzDate } =
    args;
  const dateStamp = amzDate.slice(0, 8);
  const service = "s3";

  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...(args.extraHeaders ?? {}),
  };

  const sortedKeys = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort();
  const canonicalHeaders =
    sortedKeys
      .map((k) => {
        const v = headers[Object.keys(headers).find((h) => h.toLowerCase() === k)!];
        return `${k}:${String(v).trim()}`;
      })
      .join("\n") + "\n";
  const signedHeaders = sortedKeys.join(";");

  const canonicalQuery = [...url.searchParams.entries()]
    .map(([k, v]) => [uriEncode(k, false), uriEncode(v, false)] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const canonicalRequest = [
    method,
    uriEncode(decodeURIComponent(url.pathname), true),
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning)
    .update(stringToSign)
    .digest("hex");

  return {
    ...headers,
    authorization:
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

export function amzDateNow(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function createS3Destination(
  config: S3Config,
  fetchImpl: typeof fetch = fetch,
  clock: () => Date = () => new Date()
): Destination {
  const prefix = config.prefix ? config.prefix.replace(/\/+$/, "") + "/" : "";

  const urlFor = (objectPath: string, query?: Record<string, string>) => {
    const url = new URL(config.endpoint);
    url.pathname = `/${config.bucket}/${prefix}${objectPath}`.replace(/\/{2,}/g, "/");
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
    return url;
  };

  async function call(
    method: string,
    url: URL,
    body?: Uint8Array,
    contentType?: string
  ): Promise<Response> {
    // Payload is hashed rather than declared UNSIGNED so that a
    // corrupted body is rejected by the service, not silently stored.
    const payloadHash = body ? sha256Hex(body) : sha256Hex("");
    const headers = signRequest({
      method,
      url,
      region: config.region,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      payloadHash,
      amzDate: amzDateNow(clock()),
      extraHeaders: contentType ? { "content-type": contentType } : undefined,
    });
    return fetchImpl(url.toString(), {
      method,
      headers,
      body: body ? Buffer.from(body) : undefined,
    });
  }

  return {
    kind: "s3",
    // The endpoint and bucket are not secrets; the keys are, and are
    // never included here or anywhere a report can reach.
    label: `s3:${new URL(config.endpoint).host}/${config.bucket}`,
    async put(objectPath, bytes) {
      const res = await call("PUT", urlFor(objectPath), bytes, "application/octet-stream");
      if (!res.ok) {
        throw new Error(`destination PUT failed with ${res.status}`);
      }
    },
    async get(objectPath) {
      const res = await call("GET", urlFor(objectPath));
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`destination GET failed with ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    },
    async head(objectPath) {
      const res = await call("HEAD", urlFor(objectPath));
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`destination HEAD failed with ${res.status}`);
      return {
        path: objectPath,
        size: Number(res.headers.get("content-length") ?? 0),
      };
    },
    async list(listPrefix) {
      const out: DestinationObject[] = [];
      let token: string | undefined;
      do {
        const url = new URL(config.endpoint);
        url.pathname = `/${config.bucket}`;
        url.searchParams.set("list-type", "2");
        url.searchParams.set("prefix", `${prefix}${listPrefix}`);
        if (token) url.searchParams.set("continuation-token", token);
        const res = await call("GET", url);
        if (!res.ok) throw new Error(`destination LIST failed with ${res.status}`);
        const xml = await res.text();
        for (const m of xml.matchAll(
          /<Contents>[\s\S]*?<Key>([\s\S]*?)<\/Key>[\s\S]*?<Size>(\d+)<\/Size>[\s\S]*?<\/Contents>/g
        )) {
          out.push({
            path: m[1].replace(prefix, ""),
            size: Number(m[2]),
          });
        }
        const next = xml.match(
          /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/
        );
        token = next ? next[1] : undefined;
      } while (token);
      return out;
    },
    async delete(objectPath) {
      const res = await call("DELETE", urlFor(objectPath));
      // 204 is success; 404 means it is already gone, which is the same
      // outcome and must not be an error under duplicate cron delivery.
      if (!res.ok && res.status !== 404) {
        throw new Error(`destination DELETE failed with ${res.status}`);
      }
    },
    async verifyAccess() {
      const probe = ".mandate-backup-probe";
      const payload = new TextEncoder().encode("ok");
      try {
        await this.put(probe, payload);
        const back = await this.get(probe);
        await this.delete(probe);
        if (!back || Buffer.from(back).toString() !== "ok") {
          return { ok: false, detail: "probe wrote but did not read back identically" };
        }
        return { ok: true, detail: "put/get/delete round trip succeeded" };
      } catch (err) {
        // The message may carry a status code but never a credential.
        return { ok: false, detail: `destination unusable: ${String(err)}` };
      }
    },
  };
}
