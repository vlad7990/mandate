/**
 * One-shot build script — rasterise public/og-card.svg → public/og.png.
 *
 * Run with: node scripts/build-og.mjs
 *
 * sharp is a transitive dep of Next.js (used internally for image
 * optimisation) so we don't need to add it explicitly.
 *
 * Notes on text rendering: sharp uses librsvg under the hood for SVG
 * rasterisation. librsvg picks fonts from the system, so the result
 * uses whatever serif/monospace your machine has installed (typically
 * Menlo + Georgia on macOS). That's "good enough" for a beta launch.
 * For pixel-perfect typography, install the actual font files on the
 * build host or pre-bake the wordmark to SVG paths.
 */
import sharp from "sharp";
import { readFile, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const svgPath = resolve(root, "public/og-card.svg");
const pngPath = resolve(root, "public/og.png");

const startedAt = Date.now();

const svgBuffer = await readFile(svgPath);

// density: 1× — the SVG already declares 1200×630 in viewBox, so the
// default raster matches. Bumping density would only matter if we
// needed @2x; OG cards are spec'd at 1200×630 so 1× is correct.
await sharp(svgBuffer)
  .resize(1200, 630, { fit: "fill" })
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toFile(pngPath);

const { size } = await stat(pngPath);
const elapsed = Date.now() - startedAt;
const kb = (size / 1024).toFixed(1);
console.log(`✓ public/og.png  (${kb} KB, ${elapsed}ms)`);
