import type { Metadata } from "next";
import { Chakra_Petch, JetBrains_Mono, Manrope } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

// Display: angular, instrument-panel feel for titles, HUD labels and banners.
const display = Chakra_Petch({
  variable: "--font-chakra",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

// Body: clean, highly legible UI text.
const body = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

// Numerals: tabular readouts (timer, score, telemetry).
const mono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AURA — Astro-Shield Crew Challenge & CORPUS 3D Anatomy",
  description:
    "Two 3D applications in one cockpit: ASTRO-SHIELD, a playable 40-second rover run that doubles as a stealth cognitive & behavioral assessment (PVT and POMS constructs), and CORPUS, an interactive 3D human anatomy explorer built on open CC BY reference bodies.",
  keywords: [
    "3D game",
    "stealth assessment",
    "PVT",
    "POMS",
    "aerospace medicine",
    "anatomy",
    "3D",
    "interactive",
    "three.js",
  ],
  openGraph: {
    title: "AURA — Astro-Shield Crew Challenge & CORPUS 3D Anatomy",
    description:
      "Pilot the rover, power the habitat shield — and explore a 3D human atlas. Two Three.js applications in the browser.",
    siteName: "AURA",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${display.variable} ${body.variable} ${mono.variable} antialiased bg-[#070a0e] text-zinc-100`}
        suppressHydrationWarning
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
