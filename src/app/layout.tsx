import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { AGENT_COUNT } from "./(marketing)/_constants";
import "./globals.css";

/*
 * `preload: false` on all three — the §167 ruling.
 *
 * These are the APP's faces. The marketing routes declare their own
 * (Fraunces / Hanken Grotesk / JetBrains variable) in
 * `(marketing)/layout.tsx`, and render in those exclusively: measured
 * on `/`, Hanken covers 256 elements, JetBrains 148 and Fraunces 64,
 * while Inter and Space Grotesk cover ZERO.
 *
 * But this layout wraps every route, so next/font preloaded all three
 * on the marketing pages too — 101 KB of the homepage's 236 KB of font
 * bytes was downloaded, never rendered, and worse, PRELOADED, so the
 * dead faces competed for the critical path against the live ones.
 *
 * Dropping the preload does not remove the @font-face rules: a browser
 * still fetches these the moment a route actually renders text in
 * them, which is every app, portal and auth route. It only stops the
 * speculative fetch on routes that never use them. Measured on `/`:
 * 236 KB -> 166 KB, six font files -> four, six preloads -> three.
 *
 * If a future marketing surface starts rendering Inter, this becomes a
 * late fetch rather than a preloaded one — `scripts/perf-probe.mjs`
 * is what would catch it.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  preload: false,
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  preload: false,
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["500", "700"],
  preload: false,
});

const SITE_TITLE = "Mandate — AI Executive Search Operating System";
// Derived, never retyped. This string said "14 intelligent agents"
// while the product had 17 — the same drift `_constants.ts` was written
// to end. It was only ever corrected on the marketing layout, which
// overrode it for `/` and left every other route still claiming 14.
const SITE_DESCRIPTION =
  `The AI Operating System for Executive Search. From one-line brief to shortlist submission with ${AGENT_COUNT} intelligent agents.`;

export const metadata: Metadata = {
  // metadataBase is the resolution origin for every relative URL in
  // openGraph.images / alternates.canonical / twitter.images below.
  // Inner routes inherit this — they only need to declare path-relative
  // values for canonical and og.images.
  metadataBase: new URL("https://getmandate.io"),
  title: {
    default: SITE_TITLE,
    template: "%s · Mandate",
  },
  description: SITE_DESCRIPTION,
  applicationName: "Mandate",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
    siteName: "Mandate",
    type: "website",
    locale: "en_US",
    // Placeholder — drop the actual social card at /public/og.png
    // (1200×630 recommended). Resolves to https://getmandate.io/og.png
    // via metadataBase.
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Mandate — AI Executive Search Operating System",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    // SVG first — modern browsers prefer it; PNG fallbacks cover
    // Safari + older Chrome / Firefox that won't render SVG favicons
    // at every size cleanly. apple-touch-icon is the home-screen
    // artefact iOS Safari saves when "Add to Home Screen" runs.
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: ["/favicon.ico"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        {children}
      </body>
    </html>
  );
}
