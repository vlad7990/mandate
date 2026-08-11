import type { Metadata } from "next";
import { Fraunces, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import { AGENT_COUNT } from "./_constants";
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

const PAGE_TITLE = "Mandate — AI Executive Search Operating System";
const PAGE_DESCRIPTION =
  `The AI Operating System for Executive Search. From a one-line brief to a defensible shortlist with ${AGENT_COUNT} specialist agents.`;

export const metadata: Metadata = {
  // Override the root template ("%s · Mandate") with an absolute title
  // so the marketing landing renders the full marketing string in the
  // browser tab + share previews. metadataBase is inherited from the
  // root layout — relative URLs below resolve against
  // https://getmandate.io.
  title: { absolute: PAGE_TITLE },
  description: PAGE_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: "/",
    siteName: "Mandate",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: PAGE_TITLE,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    images: ["/og.png"],
  },
};

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
    </div>
  );
}
