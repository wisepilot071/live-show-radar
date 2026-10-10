import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

// Display: expressive, poster-like grotesque for headlines.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});

// Body & controls: highly legible humanist sans.
const instrument = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
});

// Status labels & metadata: compact mono for a "signal" feel.
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Live Show Radar — your artists, your next unforgettable night",
    template: "%s · Live Show Radar",
  },
  description:
    "Keep track of concert and festival announcements in India from the artists you love, with honest ticket status.",
};

export const viewport: Viewport = {
  themeColor: "#0d1118",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" className={`${bricolage.variable} ${instrument.variable} ${jetbrains.variable}`}>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-signal focus:px-4 focus:py-3 focus:font-semibold focus:text-on-signal"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
