"use client";

import { FormEvent, useState } from "react";
import { buildContractCall, submitTransaction, NETWORK_PASSPHRASE } from "@/lib/stellar";
import { signWithFreighter } from "@/lib/freighter";
import { xdr, Address, nativeToScVal } from "@stellar/stellar-sdk";

interface CreateStreamFormProps {
  publicKey: string;
  onCreated: (id: bigint) => void;
}

/**
 * CreateStreamForm — Form to create a new payment stream.
 */
export function CreateStreamForm({ publicKey, onCreated }: CreateStreamFormProps) {
  const [recipient, setRecipient] = useState("");
  const [ratePerSec, setRatePerSec] = useState("");
  const [durationSec, setDurationSec] = useState("");
  const [deposit, setDeposit] = useState("");
  const [status, setStatus] = useState<"idle" | "building" | "signing" | "submitting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      // Validate
      if (!recipient || !ratePerSec || !deposit) throw new Error("Fill in all required fields.");
      const rate = BigInt(Math.round(parseFloat(ratePerSec) * 1e7));
      const dur = durationSec ? BigInt(parseInt(durationSec)) : 0n;
      const dep = BigInt(Math.round(parseFloat(deposit) * 1e7));

      if (rate <= 0n) throw new Error("Rate must be positive.");
      if (dep <= 0n) throw new Error("Deposit must be positive.");
      if (dur > 0n && dep < rate * dur) throw new Error(`Deposit too small. Need at least ${rate * dur} stroops.`);

      // Build tx
      setStatus("building");
      const args: xdr.ScVal[] = [
        new Address(publicKey).toScVal(),         // sender
        new Address(recipient).toScVal(),          // recipient
        nativeToScVal(rate, { type: "i128" }),     // rate_per_sec
        nativeToScVal(dur, { type: "u64" }),       // duration
        nativeToScVal(dep, { type: "i128" }),      // deposit
      ];

      const txXdr = await buildContractCall({ method: "create_stream", args, sourceAddress: publicKey });

      setStatus("signing");
      const signedXdr = await signWithFreighter(txXdr, NETWORK_PASSPHRASE);

      setStatus("submitting");
      const txHash = await submitTransaction(signedXdr);

      setStatus("done");
      // In a full integration we'd parse the return value from the tx meta.
      // For now, notify parent; they can refresh the list.
      onCreated(0n); // placeholder — real app parses return_value from tx meta
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("idle");
    }
  };

  const busy = status !== "idle" && status !== "done";

  const statusLabels: Record<string, string> = {
    building: "Building transaction…",
    signing: "Waiting for Freighter signature…",
    submitting: "Submitting to Testnet…",
    done: "Stream created! ✓",
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-drip-border bg-drip-card p-6 flex flex-col gap-4"
    >
      <h2 className="text-white font-semibold text-lg">Create Stream</h2>

      <div className="flex flex-col gap-1">
        <label className="text-gray-400 text-sm">Recipient address *</label>
        <input
          type="text"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="G…"
          className="bg-drip-dark border border-drip-border rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-drip-teal"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-gray-400 text-sm">Rate (tokens/sec) *</label>
          <input
            type="number"
            value={ratePerSec}
            onChange={(e) => setRatePerSec(e.target.value)}
            placeholder="e.g. 0.001"
            step="any"
            min="0"
            className="bg-drip-dark border border-drip-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-drip-teal"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-gray-400 text-sm">Duration (seconds)</label>
          <input
            type="number"
            value={durationSec}
            onChange={(e) => setDurationSec(e.target.value)}
            placeholder="0 = open-ended"
            min="0"
            className="bg-drip-dark border border-drip-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-drip-teal"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-gray-400 text-sm">Deposit (tokens) *</label>
        <input
          type="number"
          value={deposit}
          onChange={(e) => setDeposit(e.target.value)}
          placeholder="e.g. 100"
          step="any"
          min="0"
          className="bg-drip-dark border border-drip-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-drip-teal"
        />
      </div>

      {error && (
        <p className="text-red-400 text-sm bg-red-900/20 border border-red-900 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {status !== "idle" && (
        <p className="text-drip-teal text-sm text-center">
          {statusLabels[status]}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full py-3 rounded-lg bg-drip-blue text-white font-semibold text-sm hover:bg-blue-500 disabled:opacity-50 transition-colors"
      >
        {busy ? statusLabels[status] : "Create Stream"}
      </button>
    </form>
  );
}
