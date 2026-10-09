/**
 * stellar.ts — Soroban RPC helpers and contract client factory.
 *
 * Uses @stellar/stellar-sdk v13 with the built-in SorobanRpc module.
 */

import {
  Contract,
  Keypair,
  Networks,
  rpc as SorobanRpc,
  TransactionBuilder,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";

// ─── Environment ─────────────────────────────────────────────────────────────

export const CONTRACT_ID =
  process.env.NEXT_PUBLIC_CONTRACT_ID ?? "";

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://soroban-testnet.stellar.org";

export const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ??
  Networks.TESTNET;

export const TOKEN_ADDRESS =
  process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? "";

// ─── RPC client ──────────────────────────────────────────────────────────────

export function getRpcServer(): SorobanRpc.Server {
  return new SorobanRpc.Server(RPC_URL, { allowHttp: false });
}

// ─── Stream type (mirrors on-chain struct) ───────────────────────────────────

export type StreamStatus = "Active" | "Paused" | "Finished";

export interface Stream {
  sender: string;
  recipient: string;
  rate_per_sec: bigint;
  start_time: bigint;
  end_time: bigint;
  deposit: bigint;
  collected: bigint;
  paused_duration: bigint;
  pause_start: bigint;
  status: StreamStatus;
}

export interface DripListEntry {
  recipient: string;
  weight_bps: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Compute the amount currently collectible for a stream without calling the chain.
 * Useful for real-time UI rendering at 1-second intervals.
 */
export function computeCollectible(stream: Stream): bigint {
  if (stream.status === "Finished") return 0n;

  const nowSec = BigInt(Math.floor(Date.now() / 1000));

  const effectiveNow =
    stream.status === "Paused" ? stream.pause_start : nowSec;

  const elapsed =
    effectiveNow > stream.start_time
      ? effectiveNow - stream.start_time - stream.paused_duration
      : 0n;

  const accrued =
    elapsed * stream.rate_per_sec < stream.deposit
      ? elapsed * stream.rate_per_sec
      : stream.deposit;

  const collectible = accrued > stream.collected ? accrued - stream.collected : 0n;
  return collectible;
}

/**
 * Format a raw stroop amount as a human-readable token string.
 * Assumes 7 decimal places (Stellar convention).
 */
export function formatTokens(raw: bigint, decimals = 7): string {
  const divisor = BigInt(10 ** decimals);
  const whole = raw / divisor;
  const fraction = raw % divisor;
  return `${whole}.${fraction.toString().padStart(decimals, "0").replace(/0+$/, "") || "0"}`;
}

// ─── Contract call builder ────────────────────────────────────────────────────

/**
 * Build a Soroban transaction, simulate it, then return the prepared tx XDR
 * ready for signing by Freighter.
 */
export async function buildContractCall({
  method,
  args,
  sourceAddress,
}: {
  method: string;
  args: xdr.ScVal[];
  sourceAddress: string;
}): Promise<string> {
  const server = getRpcServer();
  const account = await server.getAccount(sourceAddress);
  const contract = new Contract(CONTRACT_ID);

  const tx = new TransactionBuilder(account, {
    fee: "100000",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const simResult = await server.simulateTransaction(tx);

  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation failed: ${simResult.error}`);
  }

  const preparedTx = SorobanRpc.assembleTransaction(tx, simResult).build();
  return preparedTx.toXDR();
}

/**
 * Submit a signed transaction XDR and wait for confirmation.
 */
export async function submitTransaction(signedXdr: string): Promise<string> {
  const server = getRpcServer();
  const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  const result = await server.sendTransaction(tx);

  if (result.status === "ERROR") {
    throw new Error(`Submit failed: ${result.errorResult?.toXDR()}`);
  }

  // Poll for confirmation.
  let attempts = 0;
  while (attempts < 30) {
    await new Promise((r) => setTimeout(r, 2_000));
    const status = await server.getTransaction(result.hash);
    if (status.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
      return result.hash;
    }
    if (status.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
      throw new Error("Transaction failed on-chain.");
    }
    attempts++;
  }
  throw new Error("Transaction timed out waiting for confirmation.");
}
