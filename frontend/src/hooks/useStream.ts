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
} from "@/lib/stellar";
import { Contract, scValToNative } from "@stellar/stellar-sdk";

interface UseStreamResult {
  stream: Stream | null;
  loading: boolean;
  error: string | null;
  liveCollectible: string;
  refresh: () => void;
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
      const server = getRpcServer();
      const contract = new Contract(CONTRACT_ID);
      // Use simulateTransaction to call a view function cheaply.
      const { xdr: resultXdr } = await server.simulateTransaction(
        // We build a minimal read-only call here.
        // In production this would use the generated contract client.
        {} as any
      );
      // For the demo, we parse the raw scVal.
      // In a full integration, use the generated TS bindings from `stellar contract bindings typescript`.
      const parsed = scValToNative(resultXdr as any) as Stream;
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
