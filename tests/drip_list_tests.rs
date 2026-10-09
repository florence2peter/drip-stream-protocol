//! Integration tests for Drip List functionality.

#![cfg(test)]

use soroban_sdk::{
    testutils::Address as _,
    token::{Client as TokenClient, StellarAssetClient},
    vec, Address, Env,
};

use drip_stream_protocol::{DripListEntry, DripStreamProtocol, DripStreamProtocolClient};

fn setup() -> (Env, Address, Address, DripStreamProtocolClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let contract_id = env.register_contract(None, DripStreamProtocol);

    let token_admin = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_addr = token.address();

    let client = DripStreamProtocolClient::new(&env, &contract_id);
    client.initialize(&admin, &token_addr);

    let funder = Address::generate(&env);
    let sac = StellarAssetClient::new(&env, &token_addr);
    sac.mint(&funder, &1_000_000_i128);

    (env, funder, token_addr, client)
}

#[test]
fn test_create_drip_list_and_retrieve() {
    let (env, _, _token, client) = setup();
    let owner = Address::generate(&env);
    let r1 = Address::generate(&env);
    let r2 = Address::generate(&env);

    let entries = vec![
        &env,
        DripListEntry { recipient: r1.clone(), weight_bps: 6_000 },
        DripListEntry { recipient: r2.clone(), weight_bps: 4_000 },
    ];

    let id = client.create_drip_list(&owner, &entries);
    assert_eq!(id, 1);

    let retrieved = client.get_drip_list(&id);
    assert_eq!(retrieved.len(), 2);
    assert_eq!(retrieved.get(0).unwrap().weight_bps, 6_000);
    assert_eq!(retrieved.get(1).unwrap().weight_bps, 4_000);
}

#[test]
fn test_drip_splits_correctly() {
    let (env, funder, token_addr, client) = setup();
    let owner = Address::generate(&env);
    let r1 = Address::generate(&env);
    let r2 = Address::generate(&env);
    let r3 = Address::generate(&env);
    let token = TokenClient::new(&env, &token_addr);

    let entries = vec![
        &env,
        DripListEntry { recipient: r1.clone(), weight_bps: 5_000 }, // 50%
        DripListEntry { recipient: r2.clone(), weight_bps: 3_000 }, // 30%
        DripListEntry { recipient: r3.clone(), weight_bps: 2_000 }, // 20%
    ];
    let id = client.create_drip_list(&owner, &entries);

    client.drip(&funder, &id, &10_000_i128);

    assert_eq!(token.balance(&r1), 5_000); // 50%
    assert_eq!(token.balance(&r2), 3_000); // 30%
    assert_eq!(token.balance(&r3), 2_000); // 20%
}

#[test]
fn test_drip_list_update_changes_weights() {
    let (env, funder, token_addr, client) = setup();
    let owner = Address::generate(&env);
    let r1 = Address::generate(&env);
    let r2 = Address::generate(&env);
    let token = TokenClient::new(&env, &token_addr);

    let entries_v1 = vec![
        &env,
        DripListEntry { recipient: r1.clone(), weight_bps: 5_000 },
        DripListEntry { recipient: r2.clone(), weight_bps: 5_000 },
    ];
    let id = client.create_drip_list(&owner, &entries_v1);

    // Update: r1 gets 80%, r2 gets 20%.
    let entries_v2 = vec![
        &env,
        DripListEntry { recipient: r1.clone(), weight_bps: 8_000 },
        DripListEntry { recipient: r2.clone(), weight_bps: 2_000 },
    ];
    client.update_drip_list(&owner, &id, &entries_v2);

    client.drip(&funder, &id, &10_000_i128);

    assert_eq!(token.balance(&r1), 8_000);
    assert_eq!(token.balance(&r2), 2_000);
}

#[test]
#[should_panic]
fn test_invalid_weights_panics() {
    let (env, _, _token, client) = setup();
    let owner = Address::generate(&env);
    let r1 = Address::generate(&env);
    let r2 = Address::generate(&env);

    // Weights sum to 9_000 — should panic.
    let bad_entries = vec![
        &env,
        DripListEntry { recipient: r1.clone(), weight_bps: 5_000 },
        DripListEntry { recipient: r2.clone(), weight_bps: 4_000 },
    ];
    client.create_drip_list(&owner, &bad_entries);
}

#[test]
#[should_panic]
fn test_non_owner_cannot_update_list() {
    let (env, _, _token, client) = setup();
    let owner = Address::generate(&env);
    let attacker = Address::generate(&env);
    let r1 = Address::generate(&env);
    let r2 = Address::generate(&env);

    let entries = vec![
        &env,
        DripListEntry { recipient: r1.clone(), weight_bps: 5_000 },
        DripListEntry { recipient: r2.clone(), weight_bps: 5_000 },
    ];
    let id = client.create_drip_list(&owner, &entries);

    let new_entries = vec![
        &env,
        DripListEntry { recipient: r1.clone(), weight_bps: 10_000 },
    ];
    // attacker tries to update — should panic.
    client.update_drip_list(&attacker, &id, &new_entries);
}

#[test]
fn test_multiple_drip_lists_independent() {
    let (env, funder, token_addr, client) = setup();
    let owner = Address::generate(&env);
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    let token = TokenClient::new(&env, &token_addr);

    let list_a = vec![
        &env,
        DripListEntry { recipient: a.clone(), weight_bps: 10_000 },
    ];
    let list_b = vec![
        &env,
        DripListEntry { recipient: b.clone(), weight_bps: 10_000 },
    ];

    let id_a = client.create_drip_list(&owner, &list_a);
    let id_b = client.create_drip_list(&owner, &list_b);

    client.drip(&funder, &id_a, &1_000_i128);
    client.drip(&funder, &id_b, &2_000_i128);

    assert_eq!(token.balance(&a), 1_000);
    assert_eq!(token.balance(&b), 2_000);
}
