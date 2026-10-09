//! Shared types and storage keys for the Drip Stream Protocol.

use soroban_sdk::{contracttype, Address};

/// Unique identifier for a payment stream (monotonically increasing u64).
pub type StreamId = u64;

/// Unique identifier for a Drip List (monotonically increasing u64).
pub type DripListId = u64;

/// Lifecycle state of a stream.
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum StreamStatus {
    /// Tokens are accruing every second.
    Active,
    /// Sender paused; no accrual while paused. Timestamps adjusted on resume.
    Paused,
    /// Stream ended naturally (deposit exhausted) or was cancelled.
    Finished,
}

/// Full on-chain representation of a payment stream.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Stream {
    /// The address that created and funds the stream.
    pub sender: Address,
    /// The address that receives the streamed tokens.
    pub recipient: Address,
    /// Tokens released per second (in base units / stroops).
    pub rate_per_sec: i128,
    /// Ledger timestamp when the stream was created (or last resumed).
    pub start_time: u64,
    /// Timestamp when the stream should automatically end (0 = open-ended).
    pub end_time: u64,
    /// Total deposit locked in escrow at creation (can be topped up).
    pub deposit: i128,
    /// Amount already collected by the recipient.
    pub collected: i128,
    /// Accumulated streamed seconds while the stream was paused.
    pub paused_duration: u64,
    /// Timestamp when the stream was most recently paused (0 if not paused).
    pub pause_start: u64,
    /// Current lifecycle status.
    pub status: StreamStatus,
}

/// One entry in a Drip List: a recipient address and their weight in basis points.
/// All entries in a list must sum to exactly 10_000 bps (= 100%).
#[contracttype]
#[derive(Clone, Debug)]
pub struct DripListEntry {
    pub recipient: Address,
    /// Share in basis points (1 bps = 0.01%). Must collectively sum to 10_000.
    pub weight_bps: u32,
}

/// Top-level storage keys.
#[contracttype]
pub enum DataKey {
    /// Whether the contract has been initialised.
    Initialized,
    /// The admin address.
    Admin,
    /// The SAC token address used for all transfers.
    Token,
    /// Monotonic counter for stream IDs.
    StreamCounter,
    /// Monotonic counter for drip list IDs.
    DripListCounter,
    /// Per-stream state: key = (Stream, StreamId).
    Stream(StreamId),
    /// Per-drip-list entries: key = (DripList, DripListId).
    DripList(DripListId),
    /// Owner of a drip list.
    DripListOwner(DripListId),
}
