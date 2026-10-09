"use client";

import { FormEvent, useState } from "react";
import { buildContractCall, submitTransaction, NETWORK_PASSPHRASE, DripListEntry } from "@/lib/stellar";
import { signWithFreighter } from "@/lib/freighter";
import { xdr, Address, nativeToScVal } from "@stellar/stellar-sdk";

interface DripListPanelProps {
  publicKey: string;
}

/**
 * DripListPanel — Create a Drip List and drip tokens to it.
 * Supports up to 5 recipients with basis-point weight allocation.
 */
export function DripListPanel({ publicKey }: DripListPanelProps) {
  const [entries, setEntries] = useState<{ address: string; bps: string }[]>([
    { address: "", bps: "5000" },
    { address: "", bps: "5000" },
  ]);
  const [listId, setListId] = useState<bigint | null>(null);
  const [dripAmount, setDripAmount] = useState("");
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const totalBps = entries.reduce((acc, e) => acc + (parseInt(e.bps) || 0), 0);

  const addEntry = () => {
    if (entries.length < 5) {
      setEntries([...entries, { address: "", bps: "0" }]);
    }
  };

  const removeEntry = (i: number) => setEntries(entries.filter((_, idx) => idx !== i));

  const updateEntry = (i: number, field: "address" | "bps", value: string) => {
    setEntries(entries.map((e, idx) => (idx === i ? { ...e, [field]: value } : e)));
  };

  const createList = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (totalBps !== 10000) throw new Error(`Weights must sum to 10,000 bps. Current: ${totalBps}`);

      setStatus("Building transaction…");
      // Build entries as ScVal vec
      // In production: use generated stellar contract bindings
      const scEntries = nativeToScVal(
        entries.map((en) => ({
          recipient: new Address(en.address),
          weight_bps: parseInt(en.bps),
        }))
      );

      const args: xdr.ScVal[] = [
        new Address(publicKey).toScVal(),
        scEntries,
      ];
      const txXdr = await buildContractCall({ method: "create_drip_list", args, sourceAddress: publicKey });
      setStatus("Waiting for signature…");
      const signed = await signWithFreighter(txXdr, NETWORK_PASSPHRASE);
      setStatus("Submitting…");
      await submitTransaction(signed);
      setListId(1n); // Real app: parse return value
      setStatus("Drip List created! ✓");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("");
    }
  };

  const drip = async (e: FormEvent) => {
    e.preventDefault();
    if (!listId) return;
    setError(null);
    try {
      const amount = BigInt(Math.round(parseFloat(dripAmount) * 1e7));
      if (amount <= 0n) throw new Error("Amount must be positive.");

      setStatus("Building drip transaction…");
      const args: xdr.ScVal[] = [
        new Address(publicKey).toScVal(),
        nativeToScVal(listId, { type: "u64" }),
        nativeToScVal(amount, { type: "i128" }),
      ];
      const txXdr = await buildContractCall({ method: "drip", args, sourceAddress: publicKey });
      setStatus("Waiting for signature…");
      const signed = await signWithFreighter(txXdr, NETWORK_PASSPHRASE);
      setStatus("Submitting…");
      await submitTransaction(signed);
      setStatus(`Drip of ${dripAmount} tokens sent! ✓`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("");
    }
  };

  return (
    <div className="rounded-xl border border-drip-border bg-drip-card p-6 flex flex-col gap-5">
      <h2 className="text-white font-semibold text-lg">Drip List</h2>
      <p className="text-gray-400 text-sm">
        Create a weighted recipient list and split token deposits across it in one transaction.
      </p>

      {/* Entries */}
      <form onSubmit={createList} className="flex flex-col gap-4">
        {entries.map((entry, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              type="text"
              placeholder="G… address"
              value={entry.address}
              onChange={(e) => updateEntry(i, "address", e.target.value)}
              className="flex-1 bg-drip-dark border border-drip-border rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-drip-teal"
            />
            <div className="relative w-28">
              <input
                type="number"
                placeholder="bps"
                value={entry.bps}
                onChange={(e) => updateEntry(i, "bps", e.target.value)}
                min="0"
                max="10000"
                className="w-full bg-drip-dark border border-drip-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-drip-teal"
              />
              <span className="absolute right-2 top-2 text-gray-500 text-xs">bps</span>
            </div>
            {entries.length > 1 && (
              <button
                type="button"
                onClick={() => removeEntry(i)}
                className="text-red-400 hover:text-red-300 text-lg leading-none px-1"
              >
                ×
              </button>
            )}
          </div>
        ))}

        {/* Total */}
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Total weight</span>
          <span className={totalBps === 10000 ? "text-green-400" : "text-red-400"}>
            {totalBps} / 10,000 bps {totalBps === 10000 ? "✓" : "✗"}
          </span>
        </div>

        {entries.length < 5 && (
          <button
            type="button"
            onClick={addEntry}
            className="text-sm text-drip-blue hover:text-blue-400 text-left"
          >
            + Add recipient
          </button>
        )}

        <button
          type="submit"
          className="py-2 rounded-lg bg-drip-blue text-white font-semibold text-sm hover:bg-blue-500 transition-colors"
        >
          Create Drip List
        </button>
      </form>

      {/* Drip */}
      {listId !== null && (
        <form onSubmit={drip} className="flex flex-col gap-3 border-t border-drip-border pt-4">
          <p className="text-gray-300 text-sm">
            Drip List #{listId.toString()} created. Send tokens now:
          </p>
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Amount (tokens)"
              value={dripAmount}
              onChange={(e) => setDripAmount(e.target.value)}
              step="any"
              min="0"
              className="flex-1 bg-drip-dark border border-drip-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-drip-teal"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-drip-teal text-black font-semibold text-sm hover:opacity-90 transition"
            >
              Drip
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="text-red-400 text-sm bg-red-900/20 border border-red-900 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      {status && <p className="text-drip-teal text-sm text-center">{status}</p>}
    </div>
  );
}
