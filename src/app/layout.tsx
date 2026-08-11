import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { AGENT_COUNT } from "./(marketing)/_constants";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["500", "700"],
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
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        {children}
      </body>
    </html>
  );
}
