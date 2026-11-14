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
  title: "CORPUS — Interactive 3D Human Anatomy",
  description:
    "Explore three open anatomical reference bodies — male, female, and donor lower-limb muscles — as 3,454 individually selectable structures in the browser. CC BY 4.0 data from BodyParts3D, the Human Reference Atlas, and Andreassen et al. 2023.",
  keywords: ["anatomy", "3D", "interactive", "human body", "BodyParts3D", "Human Reference Atlas", "three.js"],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "CORPUS — Interactive 3D Human Anatomy",
    description:
      "Three open reference bodies, 3,454 selectable structures, one browser. Built on CC BY anatomy data.",
    siteName: "CORPUS",
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
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
