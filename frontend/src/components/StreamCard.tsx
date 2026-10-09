"use client";

import { useEffect, useState } from "react";
import { computeCollectible, formatTokens, Stream } from "@/lib/stellar";

interface StreamCardProps {
  streamId: bigint;
  stream: Stream;
  onCollect: (id: bigint) => Promise<void>;
  onCancel: (id: bigint) => Promise<void>;
  onPause: (id: bigint) => Promise<void>;
  onResume: (id: bigint) => Promise<void>;
  isSender: boolean;
}

/**
 * StreamCard — Displays a live-updating stream card.
 * The collectible amount ticks every second entirely in JS using
 * computeCollectible() — no on-chain reads needed for the live counter.
 */
export function StreamCard({
  streamId,
  stream,
  onCollect,
  onCancel,
  onPause,
  onResume,
  isSender,
}: StreamCardProps) {
  const [liveCollectible, setLiveCollectible] = useState("0.0");
  const [busy, setBusy] = useState(false);

  // Tick every second.
  useEffect(() => {
    const tick = () => {
      const raw = computeCollectible(stream);
      setLiveCollectible(formatTokens(raw));
    };
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [stream]);

  const handle = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const statusColor: Record<string, string> = {
    Active: "text-green-400",
    Paused: "text-yellow-400",
    Finished: "text-gray-400",
  };

  return (
    <div className="rounded-xl border border-drip-border bg-drip-card p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <p className="text-gray-400 text-xs uppercase tracking-wide">Stream #{streamId.toString()}</p>
          <p className={`text-sm font-semibold mt-1 ${statusColor[stream.status]}`}>
            ● {stream.status}
          </p>
        </div>
        <div className="text-right">
          <p className="text-gray-400 text-xs">Rate</p>
          <p className="text-white font-mono text-sm">
            {formatTokens(stream.rate_per_sec)}/s
          </p>
        </div>
      </div>

      {/* Addresses */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-gray-500">From</p>
          <p className="text-gray-300 font-mono truncate">{stream.sender.slice(0, 8)}…</p>
        </div>
        <div>
          <p className="text-gray-500">To</p>
          <p className="text-gray-300 font-mono truncate">{stream.recipient.slice(0, 8)}…</p>
        </div>
      </div>

      {/* Live collectible */}
      <div className="rounded-lg bg-drip-dark p-4 text-center">
        <p className="text-gray-400 text-xs mb-1">Available to collect</p>
        <p className="text-drip-teal font-mono text-3xl font-bold tracking-tight">
          {liveCollectible}
        </p>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Collected</span>
          <span>{formatTokens(stream.collected)} / {formatTokens(stream.deposit)}</span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-1.5">
          <div
            className="bg-drip-teal h-1.5 rounded-full transition-all duration-1000"
            style={{
              width: stream.deposit > 0n
                ? `${Number((stream.collected * 100n) / stream.deposit)}%`
                : "0%",
            }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        {stream.status !== "Finished" && (
          <button
            onClick={() => handle(() => onCollect(streamId))}
            disabled={busy}
            className="flex-1 px-3 py-2 rounded-lg bg-drip-teal text-black text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition"
          >
            Collect
          </button>
        )}
        {isSender && stream.status === "Active" && (
          <button
            onClick={() => handle(() => onPause(streamId))}
            disabled={busy}
            className="flex-1 px-3 py-2 rounded-lg border border-yellow-500 text-yellow-400 text-sm hover:bg-yellow-500 hover:text-black disabled:opacity-50 transition"
          >
            Pause
          </button>
        )}
        {isSender && stream.status === "Paused" && (
          <button
            onClick={() => handle(() => onResume(streamId))}
            disabled={busy}
            className="flex-1 px-3 py-2 rounded-lg border border-green-500 text-green-400 text-sm hover:bg-green-500 hover:text-black disabled:opacity-50 transition"
          >
            Resume
          </button>
        )}
        {isSender && stream.status !== "Finished" && (
          <button
            onClick={() => handle(() => onCancel(streamId))}
            disabled={busy}
            className="px-3 py-2 rounded-lg border border-red-700 text-red-400 text-sm hover:bg-red-700 hover:text-white disabled:opacity-50 transition"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
