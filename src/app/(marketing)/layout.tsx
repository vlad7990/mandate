import { Fraunces, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./marketing.css";

/*
 * `display: "optional"`, not "swap" — the §167 ruling.
 *
 * With "swap" the marketing fonts arrived at ~2.8s under a throttled
 * mobile load, AFTER first paint, and the headline re-wrapped from N
 * lines to N-1 as Fraunces replaced the fallback. The hero lost a line,
 * everything below it moved up ~59px, and that single reflow was 0.100
 * of a 0.116 CLS at 390px — worse at 360px.
 *
 * It never showed up before because Lighthouse's default mobile
 * emulation is a 412px Moto G, and at 412px and above the same page
 * measures 0.011. §141's "mobile CLS 0.009" was true and blind at once:
 * every iPhone from the 12 to the 16 is 390 or 393.
 *
 * "optional" gives the browser a ~100ms block period and then, if the
 * face has not arrived, keeps the fallback for the REST OF THAT PAGE
 * LOAD rather than swapping mid-view. No swap, no re-wrap, no shift.
 * Measured: 0.116 -> 0.022 at 390px, 0.120 -> 0.024 at 360px.
 *
 * The trade is deliberate and was the founder's call: a visitor on a
 * genuinely slow first load sees the fallback for that load instead of
 * the brand face. Every repeat visit is cached and unaffected. Fixing
 * it by reserving boxes instead was tried first and measured 0.118 —
 * i.e. nothing — because the driver is the headline's own line count,
 * not any one element's height.
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  display: "optional",
  variable: "--font-display",
  // Non-default axis — opsz is loaded by default; SOFT lets headlines
  // pick up Fraunces's softer terminal forms in italic display.
  axes: ["SOFT"],
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  display: "optional",
  variable: "--font-body",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  display: "optional",
  variable: "--font-mono",
});

/*
 * This layout deliberately exports NO metadata.
 *
 * It used to carry the homepage's title, description, canonical `/` and
 * OG card. Layout metadata is inherited by every route beneath it, so
 * `/request-access` was already emitting `<link rel="canonical" href="…/">`
 * and the homepage's OG card — and the four product pages added next
 * would each have done the same. Four routes all declaring themselves
 * canonical to `/` is how a site tells a crawler none of them exist.
 *
 * Page-specific metadata now lives on each page. This file owns only
 * what is genuinely shared: the three display fonts and the surface
 * chrome. Whatever a page does not declare falls through to the root
 * layout, which is where `metadataBase` and the title template live.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${fraunces.variable} ${hanken.variable} ${jetbrains.variable} marketing-root`}
    >
      <div className="marketing-grid" aria-hidden />
      <div className="marketing-noise" aria-hidden />
      {children}
      {/* Every other toast-calling surface mounts its own Toaster; this
          one was missing, so the request-access form's errors — a
          refused rate limit included — rendered nowhere. Found live in
          the 088 drive. */}
      <Toaster richColors position="top-right" />
    </div>
  );
}
