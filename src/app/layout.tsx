import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AURA — Astro-Shield Crew Challenge & CORPUS 3D Anatomy",
  description:
    "Two 3D applications in one cockpit: ASTRO-SHIELD, a playable 2-minute rover run that doubles as a stealth cognitive & behavioral assessment (PVT and POMS constructs), and CORPUS, an interactive 3D human anatomy explorer built on open CC BY reference bodies.",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#070a0e] text-zinc-100`}
        suppressHydrationWarning
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
