/**
 * freighter.ts — Freighter wallet integration helpers.
 *
 * Wraps @stellar/freighter-api v2 with typed, async-safe functions.
 */

import {
  getPublicKey as freighterGetPublicKey,
  getNetworkDetails,
  isConnected,
  signTransaction,
} from "@stellar/freighter-api";

/** Returns true if Freighter is installed in the browser. */
export async function isFreighterInstalled(): Promise<boolean> {
  try {
    return await isConnected();
  } catch {
    return false;
  }
}

/** Returns the user's public key, prompting connection if needed. */
export async function getPublicKey(): Promise<string> {
  return await freighterGetPublicKey();
}

/** Sign a transaction XDR with Freighter and return the signed XDR. */
export async function signWithFreighter(
  txXdr: string,
  networkPassphrase: string
): Promise<string> {
  return await signTransaction(txXdr, { networkPassphrase });
}

/** Verify the user is on the correct network. */
export async function checkNetwork(expectedPassphrase: string): Promise<void> {
  const details = await getNetworkDetails();
  if (details.networkPassphrase !== expectedPassphrase) {
    throw new Error(
      `Wrong network. Expected "${expectedPassphrase}" but Freighter is on "${details.networkPassphrase}". Please switch networks in Freighter.`
    );
  }
}
