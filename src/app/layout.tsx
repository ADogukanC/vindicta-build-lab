import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { NavLinks } from "@/components/NavLinks";
import { Footer } from "@/components/Footer";
import "./globals.css";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Vindicta Build Lab",
  description:
    "Deadlock build optimiser for Vindicta: gun and spirit DPS, item comparison and value per soul.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Extensions that restyle pages (Dark Reader and friends) add attributes to
    // <html> before React hydrates, which otherwise reports a false mismatch.
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-screen">
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <header className="sticky top-0 z-30 border-b border-ink-700 bg-ink-950/95 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-[1800px] items-center gap-3 px-4 sm:gap-6">
            <Link href="/" className="flex shrink-0 items-center gap-2.5 font-semibold tracking-tight">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-brand text-sm font-bold text-ink-950 shadow-[0_2px_12px_-2px_rgba(240,162,75,0.55),inset_0_1px_0_rgba(255,255,255,0.35)]">
                V
              </span>
              <span className="hidden text-[15px] sm:inline">
                Vindicta <span className="text-ink-400">Build Lab</span>
              </span>
            </Link>
            <NavLinks />
          </div>
        </header>
        <main id="main-content" className="mx-auto max-w-[1800px] px-4 py-4">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
