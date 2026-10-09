//! Admin helpers — initialisation guard and address management.

use soroban_sdk::{panic_with_error, Address, Env};

use crate::errors::Error;
use crate::types::DataKey;

/// Panic if the contract has already been initialised.
pub fn require_not_initialized(env: &Env) {
    if env
        .storage()
        .instance()
        .has(&DataKey::Initialized)
    {
        panic_with_error!(env, Error::AlreadyInitialized);
    }
}

/// Panic if the contract has NOT been initialised.
pub fn require_initialized(env: &Env) {
    if !env
        .storage()
        .instance()
        .has(&DataKey::Initialized)
    {
        panic_with_error!(env, Error::NotInitialized);
    }
}

/// Persist the admin address.
pub fn write_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
    env.storage().instance().extend_ttl(6_307_200, 6_307_200);
}

/// Read the current admin address (panics if not set).
pub fn read_admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get::<DataKey, Address>(&DataKey::Admin)
        .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized))
}

/// Panic if `caller` is not the current admin.
pub fn require_is_admin(env: &Env, caller: &Address) {
    let admin = read_admin(env);
    if admin != *caller {
        panic_with_error!(env, Error::NotAdmin);
    }
}
