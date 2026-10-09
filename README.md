# 💧 Drip Stream Protocol

> Continuous per-second token streaming and weighted Drip Lists — natively on Stellar Soroban.

Lock a deposit, let a recipient accrue tokens every second, split payouts across weighted lists with a single call. No oracles — pure ledger timestamps.

---

## Features

| Feature | Description |
|---|---|
| 🔄 **Streaming** | Lock a deposit; recipient accrues tokens every second. No oracle needed — pure ledger timestamps. |
| ⏸ **Pause / Resume** | Sender can freeze accrual; paused time is excluded from accounting. |
| ❌ **Cancel** | Recipient gets earned tokens; sender gets the unstreamed remainder back. |
| ➕ **Top-up** | Add more deposit to an existing stream without interruption. |
| 📋 **Drip Lists** | Weighted recipient lists (basis points). One `drip()` call splits across all recipients. |
| 🔐 **Upgradeable** | Admin can push a new WASM hash via `upgrade()` without redeployment. |
| 📦 **SAC-compatible** | Works with any Stellar Asset Contract token (USDC, XLM, etc.). |

---

## Architecture

```
drip-stream-protocol/
├── contracts/
│   └── drip_stream/
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs          # Contract entry point & public API
│           ├── types.rs        # Shared types, storage keys, enums
│           ├── errors.rs       # Contract error codes
│           ├── admin.rs        # Initialisation guard & admin helpers
│           ├── token.rs        # SAC transfer helpers
│           ├── stream.rs       # Core streaming logic & accounting
│           └── drip_list.rs    # Drip List creation, update, split
├── tests/
│   ├── stream_tests.rs         # Stream lifecycle integration tests
│   └── drip_list_tests.rs      # Drip List integration tests
├── scripts/
│   ├── deploy.sh               # Build → upload WASM → deploy → init
│   └── create_test_stream.sh   # Quick testnet stream helper
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx      # Root layout with nav & wallet button
│   │   │   ├── page.tsx        # Main dashboard
│   │   │   └── globals.css     # Tailwind base + custom styles
│   │   ├── components/
│   │   │   ├── WalletButton.tsx     # Freighter connect/disconnect
│   │   │   ├── StreamCard.tsx       # Live-ticking stream card
│   │   │   ├── CreateStreamForm.tsx # Stream creation form
│   │   │   └── DripListPanel.tsx    # Drip List CRUD + drip
│   │   ├── hooks/
│   │   │   ├── useWallet.ts    # Freighter wallet state hook
│   │   │   └── useStream.ts    # Stream polling + live collectible
│   │   └── lib/
│   │       ├── stellar.ts      # Soroban RPC helpers, types, formatters
│   │       └── freighter.ts    # Freighter API wrappers
│   ├── package.json
│   ├── tailwind.config.ts
│   └── next.config.ts
├── Cargo.toml                  # Workspace root
├── rust-toolchain.toml
└── README.md
```

---

## Smart Contract API

### Lifecycle

| Function | Auth | Description |
|---|---|---|
| `initialize(admin, token)` | — | One-time init. Sets admin and SAC token. |
| `upgrade(new_wasm_hash)` | admin | Upgrade contract WASM. |
| `transfer_admin(current, new)` | current admin | Hand off admin role. |

### Streams

| Function | Auth | Description |
|---|---|---|
| `create_stream(sender, recipient, rate_per_sec, duration, deposit)` | sender | Create stream, pull deposit. Returns `StreamId`. |
| `topup_stream(sender, stream_id, amount)` | sender | Add to deposit. |
| `pause_stream(sender, stream_id)` | sender | Freeze accrual. |
| `resume_stream(sender, stream_id)` | sender | Unfreeze; paused time excluded. |
| `cancel_stream(sender, stream_id)` | sender | Settle earned to recipient, refund rest to sender. |
| `collect(stream_id)` | anyone | Send all accrued tokens to recipient. |
| `collectible(stream_id)` | — (view) | Amount currently collectible. |
| `get_stream(stream_id)` | — (view) | Full stream state. |

### Drip Lists

| Function | Auth | Description |
|---|---|---|
| `create_drip_list(owner, entries)` | owner | Create list. Weights must sum to 10,000 bps. Returns `DripListId`. |
| `update_drip_list(owner, list_id, entries)` | owner | Replace entries. |
| `drip(sender, list_id, amount)` | sender | Deposit and split proportionally. |
| `get_drip_list(list_id)` | — (view) | Return list entries. |

---

## Streaming Accounting

```
elapsed     = now - start_time - paused_duration
accrued     = min(elapsed × rate_per_sec, deposit)
collectible = accrued - collected
```

- Pure on-chain ledger timestamps — no oracle.
- Capped at deposit so no overdraft is possible.
- Paused time is tracked cumulatively and subtracted, so resume is seamless.

---

## Prerequisites

```bash
# Rust + Wasm target
rustup target add wasm32-unknown-unknown

# Stellar CLI (latest)
cargo install --locked stellar-cli --features opt

# Node.js 20+
node --version
```

---

## Getting Started

### 1. Clone

```bash
git clone https://github.com/florence2peter/drip-stream-protocol.git
cd drip-stream-protocol
```

### 2. Run tests

```bash
cargo test --features testutils
```

Expected output:
```
test test_create_stream_stores_correct_state ... ok
test test_collectible_increases_with_time ... ok
test test_collect_transfers_tokens_to_recipient ... ok
test test_pause_freezes_accrual ... ok
test test_resume_resumes_accrual ... ok
test test_cancel_refunds_unstreamed_to_sender ... ok
test test_topup_extends_stream ... ok
test test_create_drip_list_and_retrieve ... ok
test test_drip_splits_correctly ... ok
...
```

### 3. Build WASM

```bash
cargo build --target wasm32-unknown-unknown --release
stellar contract optimize \
  --wasm target/wasm32-unknown-unknown/release/drip_stream_protocol.wasm
```

### 4. Deploy to Testnet

```bash
# Fund a testnet account
stellar keys generate --global deployer --network testnet
stellar keys fund deployer --network testnet

# Export the SAC address for USDC on testnet (or use XLM SAC)
export TOKEN_ADDRESS="<SAC_ADDRESS>"
export DEPLOYER_SECRET=$(stellar keys show deployer --network testnet)

bash scripts/deploy.sh
```

The script outputs `CONTRACT_ID` and writes `frontend/.env.local` automatically.

### 5. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Deployment Environment Variables

| Variable | Description |
|---|---|
| `DEPLOYER_SECRET` | Secret key of the deployer account |
| `TOKEN_ADDRESS` | SAC address of the payment token |
| `NEXT_PUBLIC_CONTRACT_ID` | Deployed contract address (auto-written by deploy.sh) |
| `NEXT_PUBLIC_TOKEN_ADDRESS` | Token SAC address |
| `NEXT_PUBLIC_RPC_URL` | Soroban RPC endpoint |
| `NEXT_PUBLIC_NETWORK_PASSPHRASE` | Network passphrase |

---

## Security Considerations

- **Checked arithmetic** — All math uses `checked_add` / `saturating_mul` / `saturating_sub` to prevent overflow/underflow.
- **Auth on every mutation** — `require_auth()` is called on sender/owner for all state-changing operations.
- **Initialisation guard** — `require_not_initialized` / `require_initialized` prevent double-init and calls before init.
- **TTL extensions** — Every persistent storage write calls `extend_ttl()` to prevent ledger entry expiry.
- **Deposit cap** — Collectible is always `min(accrued, deposit)` — recipient can never drain more than was deposited.
- **Access control** — Only sender can pause/resume/cancel/top-up their own stream; only list owner can update their list.
- **Re-entrancy** — Not possible in Soroban's single call-stack execution model.

**Recommended**: Before Mainnet deployment, submit to the [Soroban Audit Bank](https://stellar.org/grants-and-funding) for a free security audit.

---

## Use Cases

- **Continuous contributor rewards** — Maintainers create streams so contributors earn per-second while working on open-source issues.
- **Weighted pool payouts** — Create a Drip List with addresses weighted by contribution; a single `drip()` call splits the pool across everyone in one transaction.
- **Vesting / payroll** — Any scenario requiring continuous, interruptible token transfers with full lifecycle control.

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Write tests first — all new functionality needs test coverage
4. Run `cargo test --features testutils` and `cargo clippy`
5. Open a PR against `main`

Check the [open issues](https://github.com/florence2peter/drip-stream-protocol/issues) for tasks tagged `good first issue` or `help wanted`.

---

## License

MIT © Drip Stream Protocol Contributors

---

*Built for the Stellar ecosystem.*
