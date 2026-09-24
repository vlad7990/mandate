#!/usr/bin/env node
/**
 * The marketing performance probe (§167, gate D1(a)/D5(a)).
 *
 * Why this exists: §141 measured mobile CLS at 0.009 and was telling
 * the truth. Under applied throttling the same page measured 0.116 at
 * 390px — every iPhone from the 12 to the 16 — because the hero
 * re-wrapped when the webfont swapped in late.
 *
 * TWO things hid it, and the second is the important one:
 *
 *   1. WIDTH. Lighthouse's default mobile emulation is a 412px Moto G,
 *      and at 412px the page really is 0.011 — the reflow only bites
 *      on narrower viewports.
 *   2. SIMULATION. Lighthouse was re-run pinned to 390px against the
 *      still-broken production build and STILL reported 0.007. Lantern
 *      models the slow network over a fast trace; the font never
 *      actually arrives late, so the swap never actually reflows.
 *      Lighthouse would have missed this at ANY width.
 *
 * So this probe pins the WIDTHS *and* uses APPLIED throttling — real
 * bytes over a genuinely slow pipe. Both halves are load-bearing:
 * width alone would not have caught it.
 *
 * It is deliberately NOT in CI: it needs the network and would be a
 * flaky gate. Run it before and after any change to the marketing
 * hero, its fonts, or globals.css, and put the numbers in the ledger.
 *
 *   node scripts/perf-probe.mjs                     # production
 *   node scripts/perf-probe.mjs http://localhost:3000
 *
 * Uses `playwright-core` (a devDependency) driving the SYSTEM Chrome —
 * no bundled browser download. If Chrome is missing the script says so
 * rather than reporting zeros.
 *
 * A NOTE ON MEASURING LOCALLY: `npm run build` can report success and
 * still emit a CSS chunk with an entire stylesheet missing, from stale
 * `.next` state. Always `rm -rf .next` first, and trust the
 * `cssOk` column below — it fails loudly rather than quietly
 * measuring an unstyled page, which is exactly the trap that produced
 * a phantom 0.22 reading during §167.
 */

import { chromium } from "playwright-core";

const TARGET = process.argv[2] ?? "https://getmandate.io/";

/** 360 and 390 are the widths that matter; 412 is what Lighthouse
 *  looks at and must stay honest; 1440 guards the desktop hero. */
const VIEWPORTS = [
  { label: "mobile-360", width: 360, height: 844, cpu: 4 },
  { label: "mobile-390", width: 390, height: 844, cpu: 4 },
  { label: "mobile-412", width: 412, height: 844, cpu: 4 },
  { label: "desktop-1440", width: 1440, height: 900, cpu: 1 },
];

// Lighthouse's "Slow 4G" shape, applied rather than simulated.
const NETWORK = {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
};

/**
 * An element that exists on EVERY marketing route and carries a
 * max-width only the marketing stylesheet gives it.
 *
 * It used to be `.m-hero-trust`, which lives in the homepage hero and
 * nowhere else — so every sub-page run printed "the marketing
 * stylesheet did NOT load / these numbers are meaningless" while the
 * stylesheet was served perfectly well (§198 verified the chunk by
 * hand: `.m-hero-trust`'s RULE was in it; the ELEMENT was not on the
 * page). A tripwire that fires on healthy routes is one people learn to
 * read past, which is exactly what it must never become.
 */
const CSS_CANARY = ".m-container";

async function probe(browser, vp) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", NETWORK);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: vp.cpu });

  const kindOf = new Map();
  let fontBytes = 0;
  let fontFiles = 0;
  cdp.on("Network.responseReceived", (e) => kindOf.set(e.requestId, e.type));
  cdp.on("Network.loadingFinished", (e) => {
    if (kindOf.get(e.requestId) === "Font") {
      fontBytes += e.encodedDataLength || 0;
      fontFiles += 1;
    }
  });

  await page.addInitScript(() => {
    window.__cls = 0;
    window.__worst = 0;
    window.__lcp = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        window.__cls += entry.value;
        window.__worst = Math.max(window.__worst, entry.value);
      }
    }).observe({ type: "layout-shift", buffered: true });
    // Observed, not read back from the entry list: by the time the page
    // is evaluated the buffer has often been dropped, which reported a
    // bare "—" for LCP and would have let a regression through the one
    // check D6 asks for.
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__lcp = Math.max(window.__lcp, entry.startTime);
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });

  await page.goto(TARGET, { waitUntil: "load", timeout: 180_000 });
  // Long enough for a late font to land and do its damage if it will.
  await page.waitForTimeout(8000);

  const m = await page.evaluate((canary) => {
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    const nav = performance.getEntriesByType("navigation")[0];
    const el = document.querySelector(canary);
    return {
      cls: window.__cls,
      worst: window.__worst,
      lcp: window.__lcp || null,
      fcp: fcp ? fcp.startTime : null,
      ttfb: nav ? nav.responseStart : null,
      // If the marketing CSS did not load, max-width is `none` and every
      // number below is measuring a page that will never ship.
      cssOk: !!el && getComputedStyle(el).maxWidth !== "none",
      preloadedFonts: document.querySelectorAll('link[rel=preload][as=font]').length,
    };
  }, CSS_CANARY);

  await context.close();
  return {
    ...m,
    label: vp.label,
    fontKB: Math.round(fontBytes / 1024),
    fontFiles,
  };
}

const ms = (v) => (v == null ? "—" : `${Math.round(v)}ms`);

let browser;
try {
  // The system Chrome, not a bundled one: this probe is run by hand on a
  // developer machine, and Lighthouse already proved Chrome is there.
  browser = await chromium.launch({ channel: "chrome" });
} catch (err) {
  console.error(
    "\n✗ Could not launch Chrome via playwright-core.\n" +
      "  Install Google Chrome, or run: npx playwright install chrome\n" +
      `  (${err.message})\n`
  );
  process.exit(3);
}
try {
  console.log(`\nperf-probe → ${TARGET}\n`);
  const rows = [];
  for (const vp of VIEWPORTS) rows.push(await probe(browser, vp));

  const head = ["viewport", "CLS", "worst", "LCP", "FCP", "fonts", "preld", "cssOk"];
  console.log(head.map((h, i) => h.padEnd([13, 8, 8, 9, 9, 12, 6, 6][i])).join(""));
  for (const r of rows) {
    console.log(
      [
        r.label.padEnd(13),
        r.cls.toFixed(4).padEnd(8),
        r.worst.toFixed(4).padEnd(8),
        ms(r.lcp).padEnd(9),
        ms(r.fcp).padEnd(9),
        `${r.fontKB}KB/${r.fontFiles}`.padEnd(12),
        String(r.preloadedFonts).padEnd(6),
        (r.cssOk ? "yes" : "NO!").padEnd(6),
      ].join("")
    );
  }

  const broken = rows.filter((r) => !r.cssOk);
  if (broken.length) {
    console.error(
      "\n✗ The marketing stylesheet did NOT load — these numbers are meaningless.\n" +
        "  Locally: rm -rf .next && npm run build. In production: redeploy with --force.\n"
    );
    process.exit(2);
  }

  // §167's ruled target: CLS < 0.05 at the widths Lighthouse cannot see.
  const failures = rows.filter((r) => r.label.startsWith("mobile") && r.cls >= 0.05);
  if (failures.length) {
    console.error(
      `\n✗ CLS target missed (< 0.05) at: ${failures.map((f) => f.label).join(", ")}\n`
    );
    process.exit(1);
  }
  console.log("\n✓ CLS under 0.05 at every mobile width.\n");
} finally {
  await browser.close();
}
