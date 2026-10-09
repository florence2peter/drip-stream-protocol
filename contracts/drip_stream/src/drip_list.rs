//! Drip List logic — weighted recipient lists and batch splitting.
//!
//! # Accounting
//! Weights are in basis points (bps). 1 bps = 0.01%, so 10_000 bps = 100%.
//! All entries in a list MUST sum to exactly 10_000 bps.
//!
//! On `drip(amount)`:
//!   each_recipient_gets = floor(amount * weight_bps / 10_000)
//!
//! Dust (due to integer rounding) is kept in the contract and accumulates
//! negligibly; a future governance call can sweep it.

use soroban_sdk::{panic_with_error, Address, Env, Vec};

use crate::errors::Error;
use crate::token;
use crate::types::{DataKey, DripListEntry, DripListId};

const BPS_TOTAL: u32 = 10_000;

// ─── Storage helpers ─────────────────────────────────────────────────────────

fn next_id(env: &Env) -> DripListId {
    let id: DripListId = env
        .storage()
        .instance()
        .get(&DataKey::DripListCounter)
        .unwrap_or(0u64);
    let next = id.checked_add(1).unwrap_or_else(|| panic_with_error!(env, Error::Overflow));
    env.storage().instance().set(&DataKey::DripListCounter, &next);
    next
}

fn save_list(env: &Env, id: DripListId, entries: &Vec<DripListEntry>) {
    env.storage()
        .persistent()
        .set(&DataKey::DripList(id), entries);
    env.storage()
        .persistent()
        .extend_ttl(&DataKey::DripList(id), 6_307_200, 6_307_200);
}

fn save_owner(env: &Env, id: DripListId, owner: &Address) {
    env.storage()
        .persistent()
        .set(&DataKey::DripListOwner(id), owner);
    env.storage()
        .persistent()
        .extend_ttl(&DataKey::DripListOwner(id), 6_307_200, 6_307_200);
}

fn load_entries(env: &Env, id: DripListId) -> Vec<DripListEntry> {
    env.storage()
        .persistent()
        .get::<DataKey, Vec<DripListEntry>>(&DataKey::DripList(id))
        .unwrap_or_else(|| panic_with_error!(env, Error::DripListNotFound))
}

fn load_owner(env: &Env, id: DripListId) -> Address {
    env.storage()
        .persistent()
        .get::<DataKey, Address>(&DataKey::DripListOwner(id))
        .unwrap_or_else(|| panic_with_error!(env, Error::DripListNotFound))
}

// ─── Validation ──────────────────────────────────────────────────────────────

fn validate_entries(env: &Env, entries: &Vec<DripListEntry>) {
    if entries.is_empty() {
        panic_with_error!(env, Error::EmptyDripList);
    }
    let sum: u32 = entries.iter().map(|e| e.weight_bps).sum();
    if sum != BPS_TOTAL {
        panic_with_error!(env, Error::InvalidWeights);
    }
}

// ─── Public interface ────────────────────────────────────────────────────────

/// Create a new Drip List and return its ID.
pub fn create(env: &Env, owner: Address, entries: Vec<DripListEntry>) -> DripListId {
    crate::admin::require_initialized(env);
    validate_entries(env, &entries);
    let id = next_id(env);
    save_list(env, id, &entries);
    save_owner(env, id, &owner);
    id
}

/// Replace a Drip List's entries (owner only).
pub fn update(env: &Env, owner: Address, id: DripListId, entries: Vec<DripListEntry>) {
    let stored_owner = load_owner(env, id);
    if stored_owner != owner {
        panic_with_error!(env, Error::NotOwner);
    }
    validate_entries(env, &entries);
    save_list(env, id, &entries);
}

/// Deposit `amount` and split it proportionally across the list.
pub fn drip(env: &Env, sender: Address, id: DripListId, amount: i128) {
    if amount <= 0 {
        panic_with_error!(env, Error::ZeroAmount);
    }
    let entries = load_entries(env, id);

    // Pull funds from sender into contract first.
    let contract = env.current_contract_address();
    token::transfer(env, &sender, &contract, amount);

    // Distribute proportionally.
    for entry in entries.iter() {
        // floor division — dust stays in contract.
        let share = amount
            .saturating_mul(entry.weight_bps as i128)
            / BPS_TOTAL as i128;
        if share > 0 {
            token::transfer(env, &contract, &entry.recipient, share);
        }
    }
}

/// View: return a list's entries.
pub fn get(env: &Env, id: DripListId) -> Vec<DripListEntry> {
    load_entries(env, id)
}
