//! # Drip Stream Protocol — Soroban Smart Contract
//!
//! Brings the core Drips Network funding primitive natively to Stellar/Soroban.
//!
//! ## What it does
//! - **Streams**: Sender locks tokens; recipient accrues them per-second continuously.
//!   Anyone can trigger `collect` at any time — no round-trips needed.
//! - **Drip Lists**: Weighted recipient lists. A single `drip` call splits a deposit
//!   proportionally across all recipients defined in the list.
//! - **Pause / Cancel / Top-up**: Full lifecycle management on every stream.
//!
//! ## Security model
//! - Immutable admin set at init; only admin can upgrade the contract.
//! - All arithmetic uses checked / saturating operations — no overflow paths.
//! - Re-entrancy is impossible in Soroban's execution model (single host call stack).
//! - Storage TTL extensions are called on every write to prevent ledger expiry.

#![no_std]

mod admin;
mod drip_list;
mod errors;
mod stream;
mod token;
mod types;

use soroban_sdk::{contract, contractimpl, Address, Env, Vec};
use types::{DripListId, StreamId};

// ─── Re-export public types so the generated bindings carry them ────────────
pub use types::{DripListEntry, Stream, StreamStatus};

/// The single top-level contract that routes all calls.
#[contract]
pub struct DripStreamProtocol;

#[contractimpl]
impl DripStreamProtocol {
    // ─── Lifecycle ──────────────────────────────────────────────────────────

    /// Initialise the contract. Must be called exactly once.
    ///
    /// # Arguments
    /// * `admin`       – Address that can pause the protocol and perform upgrades.
    /// * `token`       – SAC (Stellar Asset Contract) address for the payment token.
    pub fn initialize(env: Env, admin: Address, token: Address) {
        admin::require_not_initialized(&env);
        admin::write_admin(&env, &admin);
        token::write_token(&env, &token);
        env.storage().instance().set(&types::DataKey::Initialized, &true);
        // Extend instance storage TTL to ~1 year (each ledger ≈ 5 s).
        env.storage()
            .instance()
            .extend_ttl(6_307_200, 6_307_200);
    }

    // ─── Stream API ─────────────────────────────────────────────────────────

    /// Create a new payment stream.
    ///
    /// # Arguments
    /// * `sender`      – Must auth; tokens are pulled from this address.
    /// * `recipient`   – Address that accrues tokens over time.
    /// * `rate_per_sec`– Tokens (in stroops) released every ledger-second.
    /// * `duration`    – Total stream duration in seconds (0 = open-ended).
    /// * `deposit`     – Upfront deposit locked into escrow (≥ rate_per_sec * duration).
    ///
    /// Returns the new `StreamId`.
    pub fn create_stream(
        env: Env,
        sender: Address,
        recipient: Address,
        rate_per_sec: i128,
        duration: u64,
        deposit: i128,
    ) -> StreamId {
        sender.require_auth();
        stream::create(&env, sender, recipient, rate_per_sec, duration, deposit)
    }

    /// Top up the deposit on an existing stream.
    pub fn topup_stream(env: Env, sender: Address, stream_id: StreamId, amount: i128) {
        sender.require_auth();
        stream::topup(&env, sender, stream_id, amount);
    }

    /// Pause a running stream (sender only).
    pub fn pause_stream(env: Env, sender: Address, stream_id: StreamId) {
        sender.require_auth();
        stream::pause(&env, sender, stream_id);
    }

    /// Resume a paused stream (sender only).
    pub fn resume_stream(env: Env, sender: Address, stream_id: StreamId) {
        sender.require_auth();
        stream::resume(&env, sender, stream_id);
    }

    /// Cancel a stream and refund the unstreamed deposit to sender.
    pub fn cancel_stream(env: Env, sender: Address, stream_id: StreamId) {
        sender.require_auth();
        stream::cancel(&env, sender, stream_id);
    }

    /// Collect all accrued tokens for a stream (callable by anyone; tokens go to recipient).
    pub fn collect(env: Env, stream_id: StreamId) -> i128 {
        stream::collect(&env, stream_id)
    }

    /// View: return the amount currently collectible for a stream.
    pub fn collectible(env: Env, stream_id: StreamId) -> i128 {
        stream::collectible(&env, stream_id)
    }

    /// View: return the full stream state.
    pub fn get_stream(env: Env, stream_id: StreamId) -> Stream {
        stream::get(&env, stream_id)
    }

    // ─── Drip List API ──────────────────────────────────────────────────────

    /// Create a named Drip List.
    ///
    /// # Arguments
    /// * `owner`       – Must auth; owns this list.
    /// * `entries`     – Vec of (address, weight_bps) pairs. Weights must sum to 10_000.
    ///
    /// Returns the new `DripListId`.
    pub fn create_drip_list(
        env: Env,
        owner: Address,
        entries: Vec<DripListEntry>,
    ) -> DripListId {
        owner.require_auth();
        drip_list::create(&env, owner, entries)
    }

    /// Update the entries on an existing Drip List (owner only).
    pub fn update_drip_list(
        env: Env,
        owner: Address,
        list_id: DripListId,
        entries: Vec<DripListEntry>,
    ) {
        owner.require_auth();
        drip_list::update(&env, owner, list_id, entries);
    }

    /// Drip: deposit an amount and split it across a Drip List according to weights.
    ///
    /// Callable by anyone; `sender` funds the drip.
    pub fn drip(env: Env, sender: Address, list_id: DripListId, amount: i128) {
        sender.require_auth();
        drip_list::drip(&env, sender, list_id, amount);
    }

    /// View: return a Drip List's entries.
    pub fn get_drip_list(env: Env, list_id: DripListId) -> Vec<DripListEntry> {
        drip_list::get(&env, list_id)
    }

    // ─── Admin API ──────────────────────────────────────────────────────────

    /// Upgrade the contract WASM (admin only).
    pub fn upgrade(env: Env, new_wasm_hash: soroban_sdk::BytesN<32>) {
        let admin = admin::read_admin(&env);
        admin.require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    /// Transfer admin to a new address.
    pub fn transfer_admin(env: Env, current_admin: Address, new_admin: Address) {
        current_admin.require_auth();
        admin::require_is_admin(&env, &current_admin);
        admin::write_admin(&env, &new_admin);
    }
}
