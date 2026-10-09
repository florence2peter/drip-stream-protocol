"use client";

import { useWallet } from "@/hooks/useWallet";

/**
 * WalletButton — Connect / disconnect Freighter.
 * Shows a truncated public key when connected.
 */
export function WalletButton() {
  const { installed, connected, publicKey, connecting, error, connect, disconnect } =
    useWallet();

  if (!installed) {
    return (
      <a
        href="https://freighter.app"
        target="_blank"
        rel="noopener noreferrer"
        className="px-4 py-2 rounded-lg bg-yellow-500 text-black text-sm font-semibold hover:bg-yellow-400 transition-colors"
      >
        Install Freighter
      </a>
    );
  }

  if (connected && publicKey) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-drip-teal font-mono text-sm">
          {publicKey.slice(0, 5)}…{publicKey.slice(-5)}
        </span>
        <button
          onClick={disconnect}
          className="px-4 py-2 rounded-lg border border-drip-border text-gray-400 text-sm hover:text-white hover:border-gray-500 transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={connect}
        disabled={connecting}
        className="px-4 py-2 rounded-lg bg-drip-blue text-white text-sm font-semibold hover:bg-blue-500 disabled:opacity-50 transition-colors"
      >
        {connecting ? "Connecting…" : "Connect Freighter"}
      </button>
      {error && <p className="text-red-400 text-xs max-w-xs text-right">{error}</p>}
    </div>
  );
}
