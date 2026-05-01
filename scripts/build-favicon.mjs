/**
 * One-shot build script — rasterises public/favicon.svg into the four
 * favicon artefacts the metadata in app/layout.tsx expects:
 *
 *   public/favicon-16x16.png        — small bar
 *   public/favicon-32x32.png        — standard tab favicon
 *   public/apple-touch-icon.png     — 180×180 home-screen
 *   public/favicon.ico              — multi-size ICO (16 + 32)
 *
 * Run with:  node scripts/build-favicon.mjs
 *
 * sharp is a transitive dep of Next.js (used by next/image) so we don't
 * need an explicit install. ICO assembly is hand-rolled because sharp
 * doesn't emit ICO directly — it's a small binary format and a third
 * dep just for that wasn't worth it.
 */
import sharp from "sharp";
import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const svgPath = resolve(root, "public/favicon.svg");

const svg = await readFile(svgPath);
const startedAt = Date.now();

// ────────────────────────────────────────────────────────────────────
// PNG variants
// ────────────────────────────────────────────────────────────────────

async function pngBuffer(size) {
  return sharp(svg)
    .resize(size, size, { fit: "fill" })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

const [png16, png32, png180] = await Promise.all([
  pngBuffer(16),
  pngBuffer(32),
  pngBuffer(180),
]);

await writeFile(resolve(root, "public/favicon-16x16.png"), png16);
await writeFile(resolve(root, "public/favicon-32x32.png"), png32);
await writeFile(resolve(root, "public/apple-touch-icon.png"), png180);

// ────────────────────────────────────────────────────────────────────
// favicon.ico — multi-size container with the 16×16 + 32×32 PNGs
// embedded. Format ref: https://en.wikipedia.org/wiki/ICO_(file_format)
//
//   ICONDIR (6 bytes):
//     u16 reserved (0)
//     u16 type (1 = ICO)
//     u16 image count
//
//   ICONDIRENTRY × N (16 bytes each):
//     u8  width  (0 = 256)
//     u8  height (0 = 256)
//     u8  palette colour count (0 = no palette)
//     u8  reserved (0)
//     u16 colour planes (1 for ICO)
//     u16 bits per pixel (32 for our PNG-format payloads)
//     u32 image data size
//     u32 image data offset (from start of file)
//
//   Then concatenated image payloads (PNG bytes work in Vista+ readers,
//   which covers every browser shipped this decade).
// ────────────────────────────────────────────────────────────────────

function buildIco(images) {
  const HEADER = 6;
  const ENTRY = 16;
  const directorySize = HEADER + ENTRY * images.length;

  const header = Buffer.alloc(HEADER);
  header.writeUInt16LE(0, 0);                // reserved
  header.writeUInt16LE(1, 2);                // type: icon
  header.writeUInt16LE(images.length, 4);    // image count

  const entries = Buffer.alloc(ENTRY * images.length);
  let payloadOffset = directorySize;

  images.forEach(({ size, data }, i) => {
    const off = i * ENTRY;
    entries.writeUInt8(size === 256 ? 0 : size, off);     // width
    entries.writeUInt8(size === 256 ? 0 : size, off + 1); // height
    entries.writeUInt8(0, off + 2);                       // palette
    entries.writeUInt8(0, off + 3);                       // reserved
    entries.writeUInt16LE(1, off + 4);                    // planes
    entries.writeUInt16LE(32, off + 6);                   // bpp
    entries.writeUInt32LE(data.length, off + 8);          // size
    entries.writeUInt32LE(payloadOffset, off + 12);       // offset
    payloadOffset += data.length;
  });

  return Buffer.concat([
    header,
    entries,
    ...images.map((img) => img.data),
  ]);
}

const ico = buildIco([
  { size: 16, data: png16 },
  { size: 32, data: png32 },
]);
await writeFile(resolve(root, "public/favicon.ico"), ico);

// Mirror to src/app/favicon.ico — Next.js's App Router treats
// app/favicon.ico as a special file and auto-routes it to
// /favicon.ico, OVERRIDING anything in public/. Without this mirror,
// the Vercel/Next scaffolding default keeps winning even after we
// regenerate our M favicon. Keeping both files in sync via this
// script means whoever runs `node scripts/build-favicon.mjs` next
// can't accidentally drift the two copies apart.
await writeFile(resolve(root, "src/app/favicon.ico"), ico);

// ────────────────────────────────────────────────────────────────────
// Report
// ────────────────────────────────────────────────────────────────────

const elapsed = Date.now() - startedAt;
const files = [
  "public/favicon-16x16.png",
  "public/favicon-32x32.png",
  "public/apple-touch-icon.png",
  "public/favicon.ico",
  "src/app/favicon.ico",
];

for (const f of files) {
  const { size } = await stat(resolve(root, f));
  console.log(`✓ ${f.padEnd(34)} ${(size / 1024).toFixed(1).padStart(6)} KB`);
}
console.log(`\nDone in ${elapsed}ms.`);
