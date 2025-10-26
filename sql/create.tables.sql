-- EVM Explorer Database Schema
-- Generated: 2025-10-23

-- Drop existing tables (for clean setup)
DROP TABLE IF EXISTS internal_transactions CASCADE;
DROP TABLE IF EXISTS smart_contracts CASCADE;
DROP TABLE IF EXISTS token_transfers CASCADE;
DROP TABLE IF EXISTS tokens CASCADE;
DROP TABLE IF EXISTS logs CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS addresses CASCADE;
DROP TABLE IF EXISTS blocks CASCADE;

-- ============================================================================
-- 1. BLOCKS TABLE
-- ============================================================================
CREATE TABLE blocks (
    -- Identity
    hash BYTEA PRIMARY KEY,
    number BIGINT NOT NULL UNIQUE,
    parent_hash BYTEA NOT NULL,

    -- Block producer
    miner BYTEA NOT NULL,

    -- Timing
    timestamp TIMESTAMP NOT NULL,

    -- Gas
    gas_limit NUMERIC(78, 0) NOT NULL,
    gas_used NUMERIC(78, 0) NOT NULL,
    base_fee_per_gas NUMERIC(78, 0),

    -- Merkle roots
    transactions_root BYTEA NOT NULL,
    state_root BYTEA NOT NULL,
    receipts_root BYTEA NOT NULL,

    -- Additional
    size INTEGER NOT NULL,
    extra_data BYTEA,
    difficulty NUMERIC(78, 0),
    total_difficulty NUMERIC(78, 0),
    nonce BYTEA,

    -- Metadata
    transaction_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for blocks
CREATE INDEX idx_blocks_number_desc ON blocks (number DESC);
CREATE INDEX idx_blocks_timestamp_desc ON blocks (timestamp DESC);
CREATE INDEX idx_blocks_miner ON blocks (miner);

-- ============================================================================
-- 2. ADDRESSES TABLE
-- ============================================================================
CREATE TABLE addresses (
    -- Identity
    address BYTEA PRIMARY KEY,

    -- Type
    is_contract BOOLEAN DEFAULT FALSE,

    -- Balance (cached)
    balance NUMERIC(78, 0),
    balance_updated_at TIMESTAMP,

    -- Transaction counts
    transaction_count INTEGER DEFAULT 0,

    -- Contract-specific
    contract_code BYTEA,
    contract_creator BYTEA,
    contract_created_tx BYTEA,
    contract_created_block BIGINT,

    -- Verification
    is_verified BOOLEAN DEFAULT FALSE,

    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for addresses
CREATE INDEX idx_addresses_is_contract ON addresses (is_contract);
CREATE INDEX idx_addresses_is_verified ON addresses (is_verified);
CREATE INDEX idx_addresses_balance_desc ON addresses (balance DESC) WHERE balance > 0;

-- ============================================================================
-- 3. TRANSACTIONS TABLE
-- ============================================================================
CREATE TABLE transactions (
    -- Identity
    hash BYTEA PRIMARY KEY,

    -- Block relationship
    block_hash BYTEA REFERENCES blocks(hash) ON DELETE CASCADE,
    block_number BIGINT NOT NULL,
    transaction_index INTEGER NOT NULL,

    -- Parties
    from_address BYTEA NOT NULL,
    to_address BYTEA,
    contract_address BYTEA,

    -- Value and data
    value NUMERIC(78, 0) NOT NULL DEFAULT 0,
    input BYTEA NOT NULL,
    nonce INTEGER NOT NULL,

    -- Gas
    gas_limit NUMERIC(78, 0) NOT NULL,
    gas_price NUMERIC(78, 0),
    gas_used NUMERIC(78, 0),

    -- EIP-1559
    max_fee_per_gas NUMERIC(78, 0),
    max_priority_fee_per_gas NUMERIC(78, 0),

    -- Receipt data
    status SMALLINT,
    cumulative_gas_used NUMERIC(78, 0),

    -- Transaction type
    type SMALLINT DEFAULT 0,

    -- Signature
    v NUMERIC(78, 0),
    r NUMERIC(78, 0),
    s NUMERIC(78, 0),

    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(block_hash, transaction_index)
);

-- Indexes for transactions
CREATE INDEX idx_tx_block_number_desc ON transactions (block_number DESC);
CREATE INDEX idx_tx_from_address ON transactions (from_address);
CREATE INDEX idx_tx_to_address ON transactions (to_address);
CREATE INDEX idx_tx_contract_address ON transactions (contract_address);
CREATE INDEX idx_tx_block_hash ON transactions (block_hash);
CREATE INDEX idx_tx_from_block_number ON transactions (from_address, block_number DESC);
CREATE INDEX idx_tx_to_block_number ON transactions (to_address, block_number DESC);

-- ============================================================================
-- 4. LOGS TABLE
-- ============================================================================
CREATE TABLE logs (
    -- Identity
    id BIGSERIAL PRIMARY KEY,

    -- Transaction relationship
    transaction_hash BYTEA NOT NULL REFERENCES transactions(hash) ON DELETE CASCADE,
    block_hash BYTEA NOT NULL,
    block_number BIGINT NOT NULL,
    transaction_index INTEGER NOT NULL,
    log_index INTEGER NOT NULL,

    -- Log source
    address BYTEA NOT NULL,

    -- Log data
    topic0 BYTEA,
    topic1 BYTEA,
    topic2 BYTEA,
    topic3 BYTEA,
    data BYTEA,

    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(transaction_hash, log_index)
);

-- Indexes for logs
CREATE INDEX idx_logs_block_number_desc ON logs (block_number DESC);
CREATE INDEX idx_logs_address ON logs (address);
CREATE INDEX idx_logs_topic0 ON logs (topic0);
CREATE INDEX idx_logs_topic1 ON logs (topic1);
CREATE INDEX idx_logs_topic2 ON logs (topic2);
CREATE INDEX idx_logs_topic3 ON logs (topic3);
CREATE INDEX idx_logs_address_topic0 ON logs (address, topic0);

-- ============================================================================
-- 5. TOKENS TABLE
-- ============================================================================
CREATE TABLE tokens (
    -- Identity
    contract_address BYTEA PRIMARY KEY REFERENCES addresses(address),

    -- Token metadata
    token_type VARCHAR(20) NOT NULL,
    name VARCHAR(255),
    symbol VARCHAR(50),
    decimals INTEGER,
    total_supply NUMERIC(78, 0),

    -- Holder tracking
    holder_count INTEGER DEFAULT 0,
    transfer_count INTEGER DEFAULT 0,

    -- Metadata
    icon_url VARCHAR(500),
    website VARCHAR(500),
    description TEXT,

    -- Cataloging status
    is_cataloged BOOLEAN DEFAULT FALSE,
    cataloged_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for tokens
CREATE INDEX idx_tokens_type ON tokens (token_type);
CREATE INDEX idx_tokens_holder_count_desc ON tokens (holder_count DESC);
CREATE INDEX idx_tokens_symbol ON tokens (symbol);

-- ============================================================================
-- 6. TOKEN_TRANSFERS TABLE
-- ============================================================================
CREATE TABLE token_transfers (
    -- Identity
    id BIGSERIAL PRIMARY KEY,

    -- Transaction relationship
    transaction_hash BYTEA NOT NULL,
    block_number BIGINT NOT NULL,
    log_index INTEGER NOT NULL,

    -- Token contract
    token_address BYTEA NOT NULL,

    -- Transfer details
    from_address BYTEA NOT NULL,
    to_address BYTEA NOT NULL,
    value NUMERIC(78, 0),
    token_id NUMERIC(78, 0),

    -- Token type
    token_type VARCHAR(20) NOT NULL,

    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(transaction_hash, log_index)
);

-- Indexes for token_transfers
CREATE INDEX idx_token_transfers_block_number_desc ON token_transfers (block_number DESC);
CREATE INDEX idx_token_transfers_token_address ON token_transfers (token_address);
CREATE INDEX idx_token_transfers_from_address ON token_transfers (from_address);
CREATE INDEX idx_token_transfers_to_address ON token_transfers (to_address);
CREATE INDEX idx_token_transfers_token_id ON token_transfers (token_id) WHERE token_id IS NOT NULL;
CREATE INDEX idx_token_transfers_token_from ON token_transfers (token_address, from_address);
CREATE INDEX idx_token_transfers_token_to ON token_transfers (token_address, to_address);

-- ============================================================================
-- 7. SMART_CONTRACTS TABLE
-- ============================================================================
CREATE TABLE smart_contracts (
    -- Identity
    address BYTEA PRIMARY KEY REFERENCES addresses(address),

    -- Source code
    contract_name VARCHAR(255) NOT NULL,
    compiler_version VARCHAR(100) NOT NULL,
    source_code TEXT NOT NULL,
    abi JSONB NOT NULL,
    constructor_arguments BYTEA,

    -- Compilation settings
    optimization_enabled BOOLEAN DEFAULT FALSE,
    optimization_runs INTEGER,
    evm_version VARCHAR(50),

    -- Libraries
    libraries JSONB,

    -- Verification metadata
    verified_at TIMESTAMP DEFAULT NOW(),
    verified_by VARCHAR(255),
    verification_method VARCHAR(50),

    -- License
    license_type VARCHAR(100),

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for smart_contracts
CREATE INDEX idx_smart_contracts_compiler_version ON smart_contracts (compiler_version);
CREATE INDEX idx_smart_contracts_verified_at_desc ON smart_contracts (verified_at DESC);

-- ============================================================================
-- 8. INTERNAL_TRANSACTIONS TABLE
-- ============================================================================
CREATE TABLE internal_transactions (
    -- Identity
    id BIGSERIAL PRIMARY KEY,

    -- Parent transaction
    transaction_hash BYTEA NOT NULL REFERENCES transactions(hash) ON DELETE CASCADE,
    block_number BIGINT NOT NULL,
    trace_index INTEGER NOT NULL,

    -- Call details
    call_type VARCHAR(20) NOT NULL,
    from_address BYTEA NOT NULL,
    to_address BYTEA,
    value NUMERIC(78, 0) DEFAULT 0,

    -- Gas
    gas NUMERIC(78, 0),
    gas_used NUMERIC(78, 0),

    -- Input/Output
    input BYTEA,
    output BYTEA,

    -- Error
    error TEXT,

    -- Created contract
    created_contract_address BYTEA,

    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(transaction_hash, trace_index)
);

-- Indexes for internal_transactions
CREATE INDEX idx_internal_tx_transaction_hash ON internal_transactions (transaction_hash);
CREATE INDEX idx_internal_tx_block_number_desc ON internal_transactions (block_number DESC);
CREATE INDEX idx_internal_tx_from_address ON internal_transactions (from_address);
CREATE INDEX idx_internal_tx_to_address ON internal_transactions (to_address);
CREATE INDEX idx_internal_tx_call_type ON internal_transactions (call_type);

-- ============================================================================
-- VIEWS AND FUNCTIONS
-- ============================================================================

-- Materialized view for token holder balances (updated periodically)
CREATE MATERIALIZED VIEW token_holder_balances AS
SELECT
  token_address,
  address,
  SUM(balance) as balance
FROM (
  SELECT
    token_address,
    to_address as address,
    SUM(value) as balance
  FROM token_transfers
  WHERE value IS NOT NULL
  GROUP BY token_address, to_address

  UNION ALL

  SELECT
    token_address,
    from_address as address,
    -SUM(value) as balance
  FROM token_transfers
  WHERE value IS NOT NULL
  GROUP BY token_address, from_address
) subquery
GROUP BY token_address, address
HAVING SUM(balance) > 0;

-- Index on materialized view
CREATE INDEX idx_token_holder_balances_token ON token_holder_balances (token_address);
CREATE INDEX idx_token_holder_balances_balance ON token_holder_balances (balance DESC);

-- Function to refresh token holder balances
CREATE OR REPLACE FUNCTION refresh_token_holder_balances()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW token_holder_balances;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- Tables created: 8
-- - blocks
-- - addresses
-- - transactions
-- - logs
-- - tokens
-- - token_transfers
-- - smart_contracts
-- - internal_transactions
--
-- Materialized Views: 1
-- - token_holder_balances
--
-- Total indexes: 40+
-- ============================================================================
