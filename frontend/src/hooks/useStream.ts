/**
 * useStream — Poll a stream every second and expose live collectible amount.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  computeCollectible,
  formatTokens,
  getRpcServer,
  Stream,
  CONTRACT_ID,
  NETWORK_PASSPHRASE,
} from "@/lib/stellar";
import {
  Account,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  rpc as SorobanRpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";

interface UseStreamResult {
  stream: Stream | null;
  loading: boolean;
  error: string | null;
  liveCollectible: string;
  refresh: () => void;
}

/** Build a read-only simulate call for get_stream(stream_id). */
async function simulateGetStream(
  streamId: bigint
): Promise<Stream | null> {
  const server = getRpcServer();
  const contract = new Contract(CONTRACT_ID);

  // Placeholder source — simulateTransaction does not require a funded account.
  const dummy = new Account(
    "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    "0"
  );

  const tx = new TransactionBuilder(dummy, {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call("get_stream", nativeToScVal(streamId, { type: "u64" }))
    )
    .setTimeout(60)
    .build();

  const sim = await server.simulateTransaction(tx);

  if (SorobanRpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation failed: ${sim.error}`);
  }
  if (!SorobanRpc.Api.isSimulationSuccess(sim) || !sim.result) {
    return null;
  }

  const native = scValToNative(sim.result.retval) as Record<string, unknown>;
  return {
    sender: String(native.sender),
    recipient: String(native.recipient),
    rate_per_sec: BigInt(native.rate_per_sec as bigint | number | string),
    start_time: BigInt(native.start_time as bigint | number | string),
    end_time: BigInt(native.end_time as bigint | number | string),
    deposit: BigInt(native.deposit as bigint | number | string),
    collected: BigInt(native.collected as bigint | number | string),
    paused_duration: BigInt(native.paused_duration as bigint | number | string),
    pause_start: BigInt(native.pause_start as bigint | number | string),
    status: native.status as Stream["status"],
  };
}

export function useStream(streamId: bigint | null): UseStreamResult {
  const [stream, setStream] = useState<Stream | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveCollectible, setLiveCollectible] = useState("0.0");
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStream = useCallback(async () => {
    if (streamId === null) return;
    setLoading(true);
    setError(null);
    try {
      const parsed = await simulateGetStream(streamId);
      setStream(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch stream");
    } finally {
      setLoading(false);
    }
  }, [streamId]);

  // Tick every second to update the live collectible display.
  useEffect(() => {
    if (!stream) return;
    tickRef.current = setInterval(() => {
      const raw = computeCollectible(stream);
      setLiveCollectible(formatTokens(raw));
    }, 1_000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [stream]);

  // Fetch on mount and whenever streamId changes.
  useEffect(() => {
    fetchStream();
  }, [fetchStream]);

  return {
    stream,
    loading,
    error,
    liveCollectible,
    refresh: fetchStream,
  };
}
