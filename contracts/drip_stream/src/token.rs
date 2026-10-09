//! Token helpers — read the SAC address and perform transfers.

use soroban_sdk::{token::Client as TokenClient, Address, Env};

use crate::errors::Error;
use crate::types::DataKey;

/// Persist the payment token address.
pub fn write_token(env: &Env, token: &Address) {
    env.storage().instance().set(&DataKey::Token, token);
}

/// Read the payment token address.
pub fn read_token(env: &Env) -> Address {
    env.storage()
        .instance()
        .get::<DataKey, Address>(&DataKey::Token)
        .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized))
}

/// Transfer `amount` from `from` to `to` via the SAC.
pub fn transfer(env: &Env, from: &Address, to: &Address, amount: i128) {
    let token_addr = read_token(env);
    let client = TokenClient::new(env, &token_addr);
    client.transfer(from, to, &amount);
}
