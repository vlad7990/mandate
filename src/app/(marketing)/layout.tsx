import { Fraunces, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
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

export const metadata = {
  title: "Mandate — Executive Search. Reinvented.",
  description:
    "The AI Operating System for executive search. 14 intelligent agents, 31 intelligence modules, 3-way candidate alignment.",
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
