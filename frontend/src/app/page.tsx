"use client";

import { useCallback, useState } from "react";
import { CreateStreamForm } from "@/components/CreateStreamForm";
import { DripListPanel } from "@/components/DripListPanel";
import { StreamCard } from "@/components/StreamCard";
import { useWallet } from "@/hooks/useWallet";
import {
  buildContractCall,
  submitTransaction,
  NETWORK_PASSPHRASE,
  Stream,
  CONTRACT_ID,
} from "@/lib/stellar";
import { signWithFreighter } from "@/lib/freighter";
import { Address, nativeToScVal, xdr } from "@stellar/stellar-sdk";

// ─── Demo / placeholder streams ──────────────────────────────────────────────
// In production these would be fetched via event indexing (e.g. Hubble or a
// custom indexer watching StreamCreated contract events).
const DEMO_STREAMS: { id: bigint; stream: Stream }[] = [
  {
    id: 1n,
    stream: {
      sender: "GAXYZ1234567890ABCDEFGAXYZ1234567890ABCDEFGAXYZ123456",
      recipient: "GBWXYZ1234567890ABCDEFGBWXYZ1234567890ABCDEFGBWXYZ12",
      rate_per_sec: 1_000_000n,      // 0.1 tokens/sec (7 decimals)
      start_time: BigInt(Math.floor(Date.now() / 1000) - 3600),
      end_time: BigInt(Math.floor(Date.now() / 1000) + 3600),
      deposit: 720_000_000n,         // 72 tokens
      collected: 36_000_000n,        // 3.6 tokens collected so far
      paused_duration: 0n,
      pause_start: 0n,
      status: "Active",
    },
  },
  {
    id: 2n,
    stream: {
      sender: "GCABC1234567890ABCDEFGCABC1234567890ABCDEFGCABC123456",
      recipient: "GDDEF1234567890ABCDEFGDDEF1234567890ABCDEFGDDEF123456",
      rate_per_sec: 500_000n,
      start_time: BigInt(Math.floor(Date.now() / 1000) - 7200),
      end_time: 0n,
      deposit: 10_000_000_000n,
      collected: 3_600_000_000n,
      paused_duration: 1800n,
      pause_start: BigInt(Math.floor(Date.now() / 1000) - 600),
      status: "Paused",
    },
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { connected, publicKey, sign } = useWallet();
  const [streams, setStreams] = useState(DEMO_STREAMS);
  const [activeTab, setActiveTab] = useState<"streams" | "drip-lists">("streams");

  // ── Contract interaction helpers ───────────────────────────────────────────

  const contractAction = useCallback(
    async (method: string, args: xdr.ScVal[]) => {
      if (!publicKey) throw new Error("Wallet not connected.");
      const txXdr = await buildContractCall({ method, args, sourceAddress: publicKey });
      const signed = await sign(txXdr);
      await submitTransaction(signed);
    },
    [publicKey, sign]
  );

  const handleCollect = useCallback(async (id: bigint) => {
    await contractAction("collect", [nativeToScVal(id, { type: "u64" })]);
    // Optimistically update collected.
    setStreams((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, stream: { ...s.stream, collected: s.stream.deposit } }
          : s
      )
    );
  }, [contractAction]);

  const handleCancel = useCallback(async (id: bigint) => {
    await contractAction("cancel_stream", [
      new Address(publicKey!).toScVal(),
      nativeToScVal(id, { type: "u64" }),
    ]);
    setStreams((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, stream: { ...s.stream, status: "Finished" } }
          : s
      )
    );
  }, [contractAction, publicKey]);

  const handlePause = useCallback(async (id: bigint) => {
    await contractAction("pause_stream", [
      new Address(publicKey!).toScVal(),
      nativeToScVal(id, { type: "u64" }),
    ]);
    setStreams((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              stream: {
                ...s.stream,
                status: "Paused",
                pause_start: BigInt(Math.floor(Date.now() / 1000)),
              },
            }
          : s
      )
    );
  }, [contractAction, publicKey]);

  const handleResume = useCallback(async (id: bigint) => {
    await contractAction("resume_stream", [
      new Address(publicKey!).toScVal(),
      nativeToScVal(id, { type: "u64" }),
    ]);
    setStreams((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, stream: { ...s.stream, status: "Active", pause_start: 0n } }
          : s
      )
    );
  }, [contractAction, publicKey]);

  const handleStreamCreated = useCallback((id: bigint) => {
    // A real implementation would fetch the new stream from the chain.
    console.log("New stream created, id:", id);
  }, []);

  // ─── Stats bar ────────────────────────────────────────────────────────────

  const totalActive = streams.filter((s) => s.stream.status === "Active").length;
  const totalPaused = streams.filter((s) => s.stream.status === "Paused").length;

  return (
    <div className="flex flex-col gap-10">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="text-center pt-4 pb-2">
        <div className="inline-flex items-center gap-2 bg-drip-teal/10 border border-drip-teal/30 rounded-full px-4 py-1.5 text-drip-teal text-xs font-medium mb-6">
          💧 Live on Stellar Testnet
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight mb-4">
          Stream tokens.{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-drip-blue to-drip-teal">
            Drip by drip.
          </span>
        </h1>
        <p className="text-gray-400 text-lg max-w-2xl mx-auto">
          The native Stellar implementation of continuous payment streaming and
          weighted Drip Lists — powering{" "}
          <a
            href="https://optimism.drips.network"
            target="_blank"
            rel="noopener noreferrer"
            className="text-drip-teal hover:underline"
          >
            Drips Wave
          </a>{" "}
          contributor rewards on Soroban.
        </p>

        {/* Stats */}
        <div className="mt-8 flex justify-center gap-8">
          {[
            { label: "Active Streams", value: totalActive, color: "text-green-400" },
            { label: "Paused Streams", value: totalPaused, color: "text-yellow-400" },
            { label: "Contract", value: CONTRACT_ID ? CONTRACT_ID.slice(0, 8) + "…" : "—", color: "text-drip-blue" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className={`text-2xl font-bold font-mono ${stat.color}`}>
                {stat.value}
              </p>
              <p className="text-gray-500 text-xs mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Wallet prompt ─────────────────────────────────────────────────── */}
      {!connected && (
        <div className="rounded-xl border border-drip-border bg-drip-card/50 p-6 text-center">
          <p className="text-gray-300 text-sm">
            Connect your{" "}
            <a
              href="https://freighter.app"
              target="_blank"
              rel="noopener noreferrer"
              className="text-drip-blue hover:underline"
            >
              Freighter wallet
            </a>{" "}
            to create streams and Drip Lists.
          </p>
        </div>
      )}

      {/* ── Tab bar ───────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-drip-card border border-drip-border rounded-xl p-1 w-fit">
        {(["streams", "drip-lists"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
              activeTab === tab
                ? "bg-drip-blue text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {tab === "streams" ? "💧 Streams" : "📋 Drip Lists"}
          </button>
        ))}
      </div>

      {/* ── Streams tab ───────────────────────────────────────────────────── */}
      {activeTab === "streams" && (
        <section id="streams" className="flex flex-col gap-6">
          {connected && publicKey && (
            <CreateStreamForm
              publicKey={publicKey}
              onCreated={handleStreamCreated}
            />
          )}

          <div>
            <h2 className="text-white font-semibold text-lg mb-4">
              Active Streams
            </h2>
            {streams.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-10">
                No streams yet. Create one above.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {streams.map(({ id, stream }) => (
                  <StreamCard
                    key={id.toString()}
                    streamId={id}
                    stream={stream}
                    isSender={connected && publicKey === stream.sender}
                    onCollect={handleCollect}
                    onCancel={handleCancel}
                    onPause={handlePause}
                    onResume={handleResume}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Drip Lists tab ────────────────────────────────────────────────── */}
      {activeTab === "drip-lists" && (
        <section id="drip-lists">
          {connected && publicKey ? (
            <DripListPanel publicKey={publicKey} />
          ) : (
            <div className="rounded-xl border border-drip-border bg-drip-card/50 p-10 text-center">
              <p className="text-gray-400 text-sm">
                Connect your wallet to create and manage Drip Lists.
              </p>
            </div>
          )}
        </section>
      )}

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section className="mt-4 border-t border-drip-border pt-10">
        <h2 className="text-white font-semibold text-xl mb-6 text-center">
          How it works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              icon: "🔒",
              title: "Lock & Stream",
              desc: "Deposit tokens into the Soroban escrow. They stream to the recipient per-second, on-chain, with no off-chain oracle.",
            },
            {
              icon: "📋",
              title: "Drip Lists",
              desc: "Define a weighted recipient list in basis points. One drip call splits any deposit proportionally across all recipients instantly.",
            },
            {
              icon: "⚡",
              title: "Fix → Merge → Earn",
              desc: "Drips Wave maintainers stream USDC to contributors the moment a PR merges — powered by this contract on Stellar Testnet.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-xl border border-drip-border bg-drip-card p-5"
            >
              <p className="text-3xl mb-3">{item.icon}</p>
              <h3 className="text-white font-semibold text-sm mb-2">
                {item.title}
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
