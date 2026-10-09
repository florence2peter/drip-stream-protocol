#!/usr/bin/env bash
# ============================================================
# deploy.sh — Build and deploy Drip Stream Protocol to Testnet
# ============================================================
set -euo pipefail

# ── Config ────────────────────────────────────────────────
NETWORK="${NETWORK:-testnet}"
RPC_URL="${RPC_URL:-https://soroban-testnet.stellar.org}"
NETWORK_PASSPHRASE="${NETWORK_PASSPHRASE:-Test SDF Network ; September 2015}"
DEPLOYER_SECRET="${DEPLOYER_SECRET:?Please export DEPLOYER_SECRET}"
TOKEN_ADDRESS="${TOKEN_ADDRESS:?Please export TOKEN_ADDRESS (SAC address)}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Drip Stream Protocol — Deployment"
echo " Network : $NETWORK"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Build ──────────────────────────────────────────────
echo "▸ Building WASM..."
cargo build --manifest-path contracts/drip_stream/Cargo.toml \
  --target wasm32-unknown-unknown \
  --release

WASM="target/wasm32-unknown-unknown/release/drip_stream_protocol.wasm"

# ── 2. Optimise ───────────────────────────────────────────
echo "▸ Optimising WASM..."
stellar contract optimize --wasm "$WASM"
OPT_WASM="${WASM%.wasm}.optimized.wasm"

# ── 3. Derive deployer address ────────────────────────────
DEPLOYER_ADDRESS=$(stellar keys address --secret-key "$DEPLOYER_SECRET")
echo "▸ Deployer : $DEPLOYER_ADDRESS"

# ── 4. Upload WASM ────────────────────────────────────────
echo "▸ Uploading WASM to Soroban..."
WASM_HASH=$(stellar contract upload \
  --wasm "$OPT_WASM" \
  --source "$DEPLOYER_SECRET" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE")
echo "▸ WASM hash : $WASM_HASH"

# ── 5. Deploy contract ────────────────────────────────────
echo "▸ Deploying contract..."
CONTRACT_ID=$(stellar contract deploy \
  --wasm-hash "$WASM_HASH" \
  --source "$DEPLOYER_SECRET" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE")
echo "▸ Contract ID : $CONTRACT_ID"

# ── 6. Initialise contract ────────────────────────────────
echo "▸ Initialising contract..."
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$DEPLOYER_SECRET" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  -- initialize \
  --admin "$DEPLOYER_ADDRESS" \
  --token "$TOKEN_ADDRESS"

echo ""
echo "✅ Deployment complete!"
echo "   Contract ID : $CONTRACT_ID"
echo "   WASM hash   : $WASM_HASH"
echo ""
echo "Export for frontend:"
echo "  export NEXT_PUBLIC_CONTRACT_ID=$CONTRACT_ID"
echo "  export NEXT_PUBLIC_TOKEN_ADDRESS=$TOKEN_ADDRESS"
echo "  export NEXT_PUBLIC_NETWORK=$NETWORK"

# ── 7. Save addresses to .env.local ──────────────────────
cat > ../frontend/.env.local <<EOF
NEXT_PUBLIC_CONTRACT_ID=$CONTRACT_ID
NEXT_PUBLIC_TOKEN_ADDRESS=$TOKEN_ADDRESS
NEXT_PUBLIC_NETWORK_PASSPHRASE=$NETWORK_PASSPHRASE
NEXT_PUBLIC_RPC_URL=$RPC_URL
EOF
echo "▸ .env.local written to frontend/"
