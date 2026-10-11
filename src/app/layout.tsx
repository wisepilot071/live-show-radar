import type { Metadata, Viewport } from "next";
import { Fraunces, Instrument_Sans } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

// Display: editorial serif with optical sizing, for headlines.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz"],
});

// Body, controls and metadata: highly legible humanist sans.
const instrument = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
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
  themeColor: "#f7f4ec",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" className={`${fraunces.variable} ${instrument.variable}`}>
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
