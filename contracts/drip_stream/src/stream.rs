//! Core streaming logic.
//!
//! # Accounting model
//!
//! For an active stream:
//!   elapsed = now - start_time - paused_duration
//!   accrued = min(elapsed * rate_per_sec, deposit)
//!   collectible = accrued - collected
//!
//! This is purely computed on-chain from ledger timestamps — no off-chain oracle needed.

use soroban_sdk::{Address, Env};

use crate::errors::Error;
use crate::token;
use crate::types::{DataKey, Stream, StreamId, StreamStatus};

// ─── Storage helpers ────────────────────────────────────────────────────────

fn next_id(env: &Env) -> StreamId {
    let id: StreamId = env
        .storage()
        .instance()
        .get(&DataKey::StreamCounter)
        .unwrap_or(0u64);
    let next = id.checked_add(1).unwrap_or_else(|| panic_with_error!(env, Error::Overflow));
    env.storage().instance().set(&DataKey::StreamCounter, &next);
    next
}

fn save(env: &Env, id: StreamId, stream: &Stream) {
    env.storage()
        .persistent()
        .set(&DataKey::Stream(id), stream);
    // Keep persistent entry alive for ~1 year.
    env.storage()
        .persistent()
        .extend_ttl(&DataKey::Stream(id), 6_307_200, 6_307_200);
}

fn load(env: &Env, id: StreamId) -> Stream {
    env.storage()
        .persistent()
        .get::<DataKey, Stream>(&DataKey::Stream(id))
        .unwrap_or_else(|| panic_with_error!(env, Error::StreamNotFound))
}

// ─── Internal accounting ─────────────────────────────────────────────────────

/// Seconds elapsed while the stream was actively running (paused time excluded).
fn active_elapsed(env: &Env, s: &Stream) -> u64 {
    let now = env.ledger().timestamp();
    // If we're currently paused, `pause_start` marks the freeze point.
    let effective_now = if s.status == StreamStatus::Paused {
        s.pause_start
    } else {
        now
    };
    let raw = effective_now.saturating_sub(s.start_time);
    raw.saturating_sub(s.paused_duration)
}

/// Total tokens accrued (capped at deposit), minus what has already been collected.
pub fn collectible(env: &Env, id: StreamId) -> i128 {
    let s = load(env, id);
    if s.status == StreamStatus::Finished {
        // Stream done: remaining = deposit - collected, but could be 0.
        return 0_i128.max(s.deposit.saturating_sub(s.collected));
    }
    let elapsed = active_elapsed(env, &s) as i128;
    let accrued = elapsed
        .saturating_mul(s.rate_per_sec)
        .min(s.deposit);
    accrued.saturating_sub(s.collected).max(0)
}

// ─── Public interface ────────────────────────────────────────────────────────

/// Create a new stream and transfer the deposit into contract escrow.
pub fn create(
    env: &Env,
    sender: Address,
    recipient: Address,
    rate_per_sec: i128,
    duration: u64,   // 0 = open-ended
    deposit: i128,
) -> StreamId {
    crate::admin::require_initialized(env);

    if rate_per_sec <= 0 {
        panic_with_error!(env, Error::ZeroRate);
    }
    if deposit <= 0 {
        panic_with_error!(env, Error::InsufficientDeposit);
    }
    // If duration given, deposit must cover at least the full period.
    if duration > 0 {
        let required = rate_per_sec.saturating_mul(duration as i128);
        if deposit < required {
            panic_with_error!(env, Error::InsufficientDeposit);
        }
    }

    let now = env.ledger().timestamp();
    let end_time = if duration > 0 { now + duration } else { 0 };

    let id = next_id(env);

    let stream = Stream {
        sender: sender.clone(),
        recipient,
        rate_per_sec,
        start_time: now,
        end_time,
        deposit,
        collected: 0,
        paused_duration: 0,
        pause_start: 0,
        status: StreamStatus::Active,
    };

    save(env, id, &stream);

    // Pull deposit from sender into the contract.
    token::transfer(env, &sender, &env.current_contract_address(), deposit);

    id
}

/// Add more tokens to an existing stream's escrow (sender only).
pub fn topup(env: &Env, sender: Address, id: StreamId, amount: i128) {
    if amount <= 0 {
        panic_with_error!(env, Error::ZeroAmount);
    }
    let mut s = load(env, id);
    if s.sender != sender {
        panic_with_error!(env, Error::NotSender);
    }
    if s.status == StreamStatus::Finished {
        panic_with_error!(env, Error::InvalidStreamState);
    }
    s.deposit = s.deposit.checked_add(amount).unwrap_or_else(|| panic_with_error!(env, Error::Overflow));
    save(env, id, &s);
    token::transfer(env, &sender, &env.current_contract_address(), amount);
}

/// Pause a running stream. Accrual freezes at current ledger time.
pub fn pause(env: &Env, sender: Address, id: StreamId) {
    let mut s = load(env, id);
    if s.sender != sender {
        panic_with_error!(env, Error::NotSender);
    }
    if s.status != StreamStatus::Active {
        panic_with_error!(env, Error::InvalidStreamState);
    }
    s.pause_start = env.ledger().timestamp();
    s.status = StreamStatus::Paused;
    save(env, id, &s);
}

/// Resume a paused stream. Paused duration is accumulated so accrual is unaffected.
pub fn resume(env: &Env, sender: Address, id: StreamId) {
    let mut s = load(env, id);
    if s.sender != sender {
        panic_with_error!(env, Error::NotSender);
    }
    if s.status != StreamStatus::Paused {
        panic_with_error!(env, Error::InvalidStreamState);
    }
    let now = env.ledger().timestamp();
    let pause_secs = now.saturating_sub(s.pause_start);
    s.paused_duration = s.paused_duration.saturating_add(pause_secs);
    s.pause_start = 0;
    s.status = StreamStatus::Active;
    save(env, id, &s);
}

/// Cancel stream. Recipient gets accrued tokens; sender gets the unstreamed remainder.
pub fn cancel(env: &Env, sender: Address, id: StreamId) {
    let mut s = load(env, id);
    if s.sender != sender {
        panic_with_error!(env, Error::NotSender);
    }
    if s.status == StreamStatus::Finished {
        panic_with_error!(env, Error::InvalidStreamState);
    }

    // If paused, treat cancel as-of pause_start (no extra time counted).
    let earned = collectible(env, id);
    let refund = s.deposit.saturating_sub(s.collected).saturating_sub(earned);

    s.status = StreamStatus::Finished;
    s.collected = s.deposit; // mark fully settled
    save(env, id, &s);

    let contract = env.current_contract_address();
    if earned > 0 {
        token::transfer(env, &contract, &s.recipient, earned);
    }
    if refund > 0 {
        token::transfer(env, &contract, &s.sender, refund);
    }
}

/// Collect all currently accrued tokens for the recipient.
/// Anyone can call this (tokens always go to the recipient).
pub fn collect(env: &Env, id: StreamId) -> i128 {
    let mut s = load(env, id);
    if s.status == StreamStatus::Finished {
        panic_with_error!(env, Error::InvalidStreamState);
    }

    let amount = collectible(env, id);
    if amount == 0 {
        return 0;
    }

    s.collected = s.collected.saturating_add(amount);

    // If the stream hit its end time or deposit is fully streamed, mark finished.
    let now = env.ledger().timestamp();
    let deposit_exhausted = s.collected >= s.deposit;
    let time_expired = s.end_time > 0 && now >= s.end_time;
    if deposit_exhausted || time_expired {
        s.status = StreamStatus::Finished;
    }

    save(env, id, &s);
    token::transfer(env, &env.current_contract_address(), &s.recipient, amount);

    amount
}

/// View: return the full stream record.
pub fn get(env: &Env, id: StreamId) -> Stream {
    load(env, id)
}
