/**
 * freighter.ts — Freighter wallet integration helpers.
 *
 * Wraps @stellar/freighter-api with typed, async-safe functions.
 */

import {
  getAddress,
  getNetworkDetails,
  isConnected,
  signTransaction,
} from "@stellar/freighter-api";

/** Returns true if Freighter is installed in the browser. */
export async function isFreighterInstalled(): Promise<boolean> {
  try {
    return (await isConnected()).isConnected;
  } catch {
    return false;
  }
}

/** Returns the user's public key, prompting connection if needed. */
export async function getPublicKey(): Promise<string> {
  const result = await getAddress();
  if (result.error) throw new Error(result.error);
  return result.address;
}

/** Sign a transaction XDR with Freighter and return the signed XDR. */
export async function signWithFreighter(
  txXdr: string,
  networkPassphrase: string
): Promise<string> {
  const result = await signTransaction(txXdr, {
    networkPassphrase,
  });
  if (result.error) throw new Error(result.error);
  return result.signedTxXdr;
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
