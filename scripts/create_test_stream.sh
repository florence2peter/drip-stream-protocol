#!/usr/bin/env bash
# Quick helper to create a test stream on Testnet after deployment.
set -euo pipefail

CONTRACT_ID="${CONTRACT_ID:?Export CONTRACT_ID}"
SENDER_SECRET="${SENDER_SECRET:?Export SENDER_SECRET}"
RECIPIENT="${RECIPIENT:?Export RECIPIENT address}"
RPC_URL="${RPC_URL:-https://soroban-testnet.stellar.org}"
PASSPHRASE="${PASSPHRASE:-Test SDF Network ; September 2015}"

SENDER=$(stellar keys address --secret-key "$SENDER_SECRET")

echo "Creating stream: $SENDER → $RECIPIENT"
echo "  Rate  : 100 tokens/sec"
echo "  Deposit: 360_000 tokens (1 hour)"

stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$SENDER_SECRET" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$PASSPHRASE" \
  -- create_stream \
  --sender "$SENDER" \
  --recipient "$RECIPIENT" \
  --rate_per_sec 100 \
  --duration 3600 \
  --deposit 360000

echo "✅ Stream created."
