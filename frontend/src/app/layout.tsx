import type { Metadata } from "next";
import "./globals.css";
import { WalletButton } from "@/components/WalletButton";

export const metadata: Metadata = {
  title: "Drip Stream Protocol",
  description:
    "Continuous per-second token streaming and weighted Drip Lists on Stellar Soroban — powering the Drips Wave ecosystem.",
  openGraph: {
    title: "Drip Stream Protocol",
    description: "Real-time token streaming on Stellar",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        {/* ── Top nav ───────────────────────────────────────── */}
        <header className="sticky top-0 z-50 border-b border-drip-border bg-drip-dark/80 backdrop-blur-md">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-drip-blue to-drip-teal flex items-center justify-center text-white font-bold text-sm">
                💧
              </div>
              <span className="text-white font-semibold text-base">
                Drip Stream
              </span>
              <span className="text-xs text-gray-500 font-mono bg-gray-800 px-2 py-0.5 rounded-full">
                Testnet
              </span>
            </div>

            {/* Nav links */}
            <nav className="hidden md:flex items-center gap-6 text-sm text-gray-400">
              <a href="#streams" className="hover:text-white transition-colors">Streams</a>
              <a href="#drip-lists" className="hover:text-white transition-colors">Drip Lists</a>
              <a
                href="https://github.com/drips-wave/drip-stream-protocol"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
              >
                GitHub
              </a>
            </nav>

            <WalletButton />
          </div>
        </header>

        {/* ── Main content ──────────────────────────────────── */}
        <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-10">
          {children}
        </main>

        {/* ── Footer ────────────────────────────────────────── */}
        <footer className="border-t border-drip-border text-center py-6 text-gray-600 text-xs">
          Built for{" "}
          <a
            href="https://optimism.drips.network"
            target="_blank"
            rel="noopener noreferrer"
            className="text-drip-teal hover:underline"
          >
            Drips Wave
          </a>{" "}
          · Powered by{" "}
          <a
            href="https://stellar.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-drip-blue hover:underline"
          >
            Stellar Soroban
          </a>
        </footer>
      </body>
    </html>
  );
}
