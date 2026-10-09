//! Integration tests for streaming functionality.
//!
//! Run with:
//!   cargo test --features testutils

#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    token::{Client as TokenClient, StellarAssetClient},
    Address, Env,
};

use drip_stream_protocol::{DripStreamProtocol, DripStreamProtocolClient};

// ─── Helpers ─────────────────────────────────────────────────────────────────

struct TestEnv {
    env: Env,
    admin: Address,
    token: Address,
    client: DripStreamProtocolClient<'static>,
}

fn setup() -> (Env, Address, Address, DripStreamProtocolClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let contract_id = env.register_contract(None, DripStreamProtocol);

    // Deploy a native SAC mock token.
    let token_admin = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_addr = token.address();

    let client = DripStreamProtocolClient::new(&env, &contract_id);
    client.initialize(&admin, &token_addr);

    // Mint 1_000_000 tokens to a test sender.
    let sender = Address::generate(&env);
    let sac = StellarAssetClient::new(&env, &token_addr);
    sac.mint(&sender, &1_000_000_i128);

    (env, sender, token_addr, client)
}

fn advance_time(env: &Env, seconds: u64) {
    let current = env.ledger().timestamp();
    env.ledger().set(LedgerInfo {
        timestamp: current + seconds,
        protocol_version: 22,
        sequence_number: env.ledger().sequence() + 1,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 16,
        min_persistent_entry_ttl: 6_307_200,
        max_entry_ttl: 6_307_201,
    });
}

// ─── Stream lifecycle tests ───────────────────────────────────────────────────

#[test]
fn test_create_stream_stores_correct_state() {
    let (env, sender, _token, client) = setup();
    let recipient = Address::generate(&env);

    let id = client.create_stream(&sender, &recipient, &100_i128, &100_u64, &10_000_i128);
    assert_eq!(id, 1);

    let s = client.get_stream(&id);
    assert_eq!(s.sender, sender);
    assert_eq!(s.recipient, recipient);
    assert_eq!(s.rate_per_sec, 100);
    assert_eq!(s.deposit, 10_000);
    assert_eq!(s.collected, 0);
}

#[test]
fn test_collectible_increases_with_time() {
    let (env, sender, _token, client) = setup();
    let recipient = Address::generate(&env);

    let id = client.create_stream(&sender, &recipient, &10_i128, &0_u64, &100_000_i128);

    advance_time(&env, 50);
    let amount = client.collectible(&id);
    // 50 seconds × 10 rate = 500
    assert_eq!(amount, 500);
}

#[test]
fn test_collect_transfers_tokens_to_recipient() {
    let (env, sender, token_addr, client) = setup();
    let recipient = Address::generate(&env);
    let token = TokenClient::new(&env, &token_addr);

    let id = client.create_stream(&sender, &recipient, &10_i128, &0_u64, &100_000_i128);

    advance_time(&env, 100);
    let collected = client.collect(&id);

    assert_eq!(collected, 1_000); // 100s × 10
    assert_eq!(token.balance(&recipient), 1_000);
}

#[test]
fn test_pause_freezes_accrual() {
    let (env, sender, _token, client) = setup();
    let recipient = Address::generate(&env);

    let id = client.create_stream(&sender, &recipient, &10_i128, &0_u64, &100_000_i128);

    advance_time(&env, 100); // accrued 1_000
    client.pause_stream(&sender, &id);

    advance_time(&env, 200); // should NOT accrue during pause
    let amount = client.collectible(&id);
    assert_eq!(amount, 1_000); // still 1_000
}

#[test]
fn test_resume_resumes_accrual() {
    let (env, sender, _token, client) = setup();
    let recipient = Address::generate(&env);

    let id = client.create_stream(&sender, &recipient, &10_i128, &0_u64, &100_000_i128);

    advance_time(&env, 100); // +1_000
    client.pause_stream(&sender, &id);
    advance_time(&env, 200); // paused — no accrual
    client.resume_stream(&sender, &id);
    advance_time(&env, 50); // +500

    let amount = client.collectible(&id);
    assert_eq!(amount, 1_500); // 1_000 + 500
}

#[test]
fn test_cancel_refunds_unstreamed_to_sender() {
    let (env, sender, token_addr, client) = setup();
    let recipient = Address::generate(&env);
    let token = TokenClient::new(&env, &token_addr);

    let initial_balance = token.balance(&sender);
    let id = client.create_stream(&sender, &recipient, &10_i128, &0_u64, &1_000_i128);

    advance_time(&env, 50); // 500 accrued
    client.cancel_stream(&sender, &id);

    // Recipient gets 500, sender gets 500 back.
    assert_eq!(token.balance(&recipient), 500);
    // Sender spent 1_000 deposit; got 500 back → net -500.
    assert_eq!(token.balance(&sender), initial_balance - 1_000 + 500);
}

#[test]
fn test_topup_extends_stream() {
    let (env, sender, _token, client) = setup();
    let recipient = Address::generate(&env);

    let id = client.create_stream(&sender, &recipient, &10_i128, &100_u64, &1_000_i128);
    let s_before = client.get_stream(&id);
    assert_eq!(s_before.deposit, 1_000);

    client.topup_stream(&sender, &id, &500_i128);
    let s_after = client.get_stream(&id);
    assert_eq!(s_after.deposit, 1_500);
}

#[test]
#[should_panic]
fn test_create_stream_insufficient_deposit_panics() {
    let (env, sender, _token, client) = setup();
    let recipient = Address::generate(&env);

    // rate=100, duration=100 → need 10_000; only providing 5_000 → should panic.
    client.create_stream(&sender, &recipient, &100_i128, &100_u64, &5_000_i128);
}

#[test]
#[should_panic]
fn test_non_sender_cannot_pause() {
    let (env, sender, _token, client) = setup();
    let recipient = Address::generate(&env);
    let attacker = Address::generate(&env);

    let id = client.create_stream(&sender, &recipient, &10_i128, &0_u64, &100_000_i128);
    client.pause_stream(&attacker, &id); // should panic
}

#[test]
fn test_stream_finishes_when_deposit_exhausted() {
    let (env, sender, _token, client) = setup();
    let recipient = Address::generate(&env);

    // 10 tokens/sec × 100 sec = 1_000 deposit (exact).
    let id = client.create_stream(&sender, &recipient, &10_i128, &100_u64, &1_000_i128);

    advance_time(&env, 200); // well past duration
    let collected = client.collect(&id);
    assert_eq!(collected, 1_000);

    let s = client.get_stream(&id);
    // Status should be Finished.
    use drip_stream_protocol::StreamStatus;
    assert_eq!(s.status, StreamStatus::Finished);
}
