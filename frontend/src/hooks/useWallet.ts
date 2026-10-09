/**
 * useWallet — React hook for Freighter wallet state.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  checkNetwork,
  getPublicKey,
  isFreighterInstalled,
  signWithFreighter,
} from "@/lib/freighter";
import { NETWORK_PASSPHRASE } from "@/lib/stellar";

interface WalletState {
  installed: boolean;
  connected: boolean;
  publicKey: string | null;
  connecting: boolean;
  error: string | null;
}

interface WalletActions {
  connect: () => Promise<void>;
  disconnect: () => void;
  sign: (txXdr: string) => Promise<string>;
}

export function useWallet(): WalletState & WalletActions {
  const [state, setState] = useState<WalletState>({
    installed: false,
    connected: false,
    publicKey: null,
    connecting: false,
    error: null,
  });

  // Check for Freighter on mount.
  useEffect(() => {
    isFreighterInstalled().then((installed) =>
      setState((s) => ({ ...s, installed }))
    );
  }, []);

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, connecting: true, error: null }));
    try {
      await checkNetwork(NETWORK_PASSPHRASE);
      const publicKey = await getPublicKey();
      setState((s) => ({
        ...s,
        connected: true,
        publicKey,
        connecting: false,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        connecting: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }));
    }
  }, []);

  const disconnect = useCallback(() => {
    setState((s) => ({ ...s, connected: false, publicKey: null }));
  }, []);

  const sign = useCallback(
    async (txXdr: string): Promise<string> => {
      return signWithFreighter(txXdr, NETWORK_PASSPHRASE);
    },
    []
  );

  return { ...state, connect, disconnect, sign };
}
