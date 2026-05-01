import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
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
const SITE_DESCRIPTION =
  "The AI Operating System for Executive Search. From one-line brief to shortlist submission with 14 intelligent agents.";

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
