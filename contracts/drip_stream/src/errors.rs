//! Contract error codes — surface through Soroban's panic mechanism.

use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// Contract has already been initialised.
    AlreadyInitialized = 1,
    /// Contract has not been initialised yet.
    NotInitialized = 2,
    /// Caller is not the admin.
    NotAdmin = 3,
    /// Caller is not the stream sender.
    NotSender = 4,
    /// Caller is not the drip list owner.
    NotOwner = 5,
    /// Stream does not exist.
    StreamNotFound = 6,
    /// Drip list does not exist.
    DripListNotFound = 7,
    /// Stream is not in a state that allows this operation.
    InvalidStreamState = 8,
    /// Deposit is too small for the requested rate and duration.
    InsufficientDeposit = 9,
    /// Rate per second must be > 0.
    ZeroRate = 10,
    /// Drip list weights do not sum to exactly 10_000 bps.
    InvalidWeights = 11,
    /// Drip list must have at least one entry.
    EmptyDripList = 12,
    /// Amount must be positive.
    ZeroAmount = 13,
    /// Arithmetic overflow detected.
    Overflow = 14,
}
