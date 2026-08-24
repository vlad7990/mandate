import { Fraunces, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./marketing.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  // Non-default axis — opsz is loaded by default; SOFT lets headlines
  // pick up Fraunces's softer terminal forms in italic display.
  axes: ["SOFT"],
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-body",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
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
