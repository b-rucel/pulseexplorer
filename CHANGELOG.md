# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.5] - 2025-10-27

### Added

#### Block Storage Infrastructure
- **BlockStorage** (`src/indexer/BlockStorage.js`)
  - Implement BlockStorage class for block data persistence to PostgreSQL
  - Add transformBlock() to convert ethers.js block format to PostgreSQL schema
  - Handle hex string to Buffer conversion for BYTEA columns (hash, parentHash, miner, extraData)
  - Convert BigInt values to string for NUMERIC columns (gasLimit, gasUsed, difficulty)
  - Add saveBlock() for single block insertion with ON CONFLICT handling
  - Add saveBlocks() for batch insertion using database transactions for atomicity
  - Add blockExists() to check block existence by number
  - Add getBlock() to retrieve block by number
  - Add getLastBlockNumber() to find highest indexed block
  - Add getBlockCount() to get total blocks in database
  - Add deleteBlocksFrom() for blockchain reorganization handling
  - Add getStats() to calculate database statistics (total blocks, transactions, gas usage)
  - Handle optional block fields (baseFeePerGas, extraData)
  - Support Merkle root fields (transactionsRoot, stateRoot, receiptsRoot)
  - Export singleton instance for application-wide use

#### Database Enhancements
- **Database class** (`lib/db.js`)
  - Add getClient() method to acquire pool client for manual transaction control
  - Add transaction() method with automatic BEGIN/COMMIT/ROLLBACK handling
  - Add callback-based transaction execution with error handling
  - Add insert() helper method for single row insertion with RETURNING support
  - Add optional onConflict parameter for INSERT...ON CONFLICT handling
  - Add healthCheck() method to verify database connectivity with SELECT 1
  - Add getStats() method to expose connection pool statistics (totalCount, idleCount, waitingCount)
  - Integrate transaction logging for BEGIN, COMMIT, and ROLLBACK operations
  - Ensure proper client release in transaction finally block

#### Development Testing Scripts
- **RPC test script** (`test/test-rpc.js`)
  - Add executable test script for manual RPC client validation
  - Test RPC connection, getBlockNumber(), getBlock(), getBlockRange(), getBlocksParallel()
  - Test healthCheck() for RPC connection validation
  - Display detailed block information (number, hash, timestamp, transactions, miner, gas)
  - Include proper error handling and cleanup with process exit codes

- **BlockStorage test script** (`test/test-block-storage.js`)
  - Add executable test script for manual BlockStorage validation
  - Test database connection health check before operations
  - Test single block and batch block saving workflows
  - Test transformBlock() conversion to database format
  - Test duplicate block handling with ON CONFLICT DO NOTHING
  - Test parallel block fetching and batch saving workflow
  - Test getStats() for database statistics
  - Include comprehensive logging for test output

## [0.0.4] - 2025-10-27

### Added

#### RPC Client Infrastructure
- **RpcClient** (`src/indexer/RpcClient.js`)
  - Implement RpcClient class for PulseChain RPC interaction using ethers.js v6
  - Add HTTP provider with JsonRpcProvider for standard RPC calls
  - Add WebSocket provider with graceful fallback to HTTP on errors
  - Implement getBlock() with configurable retry logic and exponential backoff
  - Add getBlockRange() for sequential block fetching
  - Add getBlocksParallel() with configurable concurrency for faster batch operations
  - Include healthCheck() for connection validation
  - Integrate winston logging for all RPC operations
  - Support environment-based configuration (RPC_URL, RPC_WS_URL, RPC_TIMEOUT, RPC_RETRIES)
  - Export singleton instance for application-wide use

#### Testing Infrastructure
- **Jest configuration** (`jest.config.js`)
  - Set Node.js as test environment
  - Configure coverage collection from src/ and lib/ directories
  - Set minimum coverage thresholds at 50% for branches, functions, lines, and statements
  - Define test file pattern matching **/test/**/*.test.js
  - Add module resolution for node_modules and src directories
  - Enable verbose output for detailed test reporting
  - Enable clearMocks and restoreMocks for test isolation
  - Set 30-second timeout for integration tests

- **RpcClient unit tests** (`test/indexer/RpcClient.test.js`)
  - Add Jest mocks for logger and ethers dependencies
  - Test connect() with HTTP and WebSocket providers
  - Test connect() error handling and graceful WebSocket fallback
  - Test getBlockNumber() success and error cases
  - Test getBlock() with retry logic and exponential backoff
  - Test getBlock() handling of null blocks and max retry failures
  - Test getBlockRange() for sequential block fetching
  - Test getBlocksParallel() with concurrency limits and null filtering
  - Test healthCheck() for RPC connection validation
  - Test close() for proper cleanup of WebSocket connections
  - Test sleep() utility function with fake timers
  - Achieve comprehensive coverage of all RpcClient methods

- **RpcClient integration tests** (`test/integration/RpcClient.integration.test.js`)
  - Add real-world RPC connection tests against live PulseChain network
  - Test getBlockNumber() returns valid and increasing block numbers
  - Test getBlock() fetches genesis block (block 0) with correct structure
  - Test getBlock() validates block properties (hash, parentHash, timestamp, miner, gas)
  - Test getBlock() handles non-existent future blocks by returning null
  - Test getBlock() with and without full transaction objects
  - Test getBlockRange() fetches sequential blocks in correct order
  - Test getBlocksParallel() with concurrency limits and performance validation
  - Test getBlocksParallel() filters out null blocks for invalid block numbers
  - Test healthCheck() verifies RPC connection health
  - Add performance tests for single block fetch and rapid sequential requests
  - Set 30-second timeout for real network calls
  - Include setup/teardown for connection lifecycle management

### Dependencies
- Added `ethers` ^6.15.0 for blockchain RPC communication
- Added `jest` ^30.2.0 for testing framework
- Added `@types/jest` ^30.0.0 for Jest TypeScript definitions

### Scripts
- Added `test` - Run all tests
- Added `test:watch` - Run tests in watch mode
- Added `test:coverage` - Generate test coverage reports
- Added `test:unit` - Run unit tests in test/indexer
- Added `test:integration` - Run integration tests

## [0.0.3] - 2025-10-26

### Fixed

#### Database Connection Handling
- **Database class** (`lib/db.js`)
  - Database constructor now accepts optional `databaseName` parameter for flexible connections
  - Changed default database from hardcoded 'postgres' to `process.env.DB_NAME` (defaults to 'pulsechain_explorer')
  - Export Database class alongside singleton instance for custom database instances
  - Fixed incorrect config reference (config.maxConnections → config.max)

- **Setup script** (`scripts/setup-db.js`)
  - Use separate Database instances for admin and target operations
  - Connect to 'postgres' database for database creation operations (adminDb)
  - Connect to target database for table checking and schema execution (targetDb)
  - Properly close connections before switching databases
  - Fix table existence check to query correct database instead of postgres

- **Reset script** (`scripts/reset-db.js`)
  - Use adminDb instance connected to 'postgres' for drop operations
  - Add colorized warning messages for destructive operations
  - Remove unused imports (fs, path)
  - Ensure proper connection cleanup on error

## [0.0.2] - 2025-10-26

### Added

#### Logging Infrastructure
- **Winston logger** (`lib/logger.js`)
  - JSON and human-readable console formats with colorization
  - File transports for error and combined logs (5MB rotation, 5 files retained)
  - Configurable log levels via `LOG_LEVEL` environment variable
  - Morgan stream support for HTTP request logging
  - Service metadata tagging

#### Terminal Color Library
- **ChromaWave** (`lib/colors.js`)
  - 24-bit true color ANSI support with extensive color palette
  - Rainbow gradient function with configurable frequency (lolcat-style)
  - Basic colors, extended true colors, muted variants, and grayscale
  - Helper functions for RGB color creation and text colorization

#### Database Infrastructure
- **PostgreSQL connection pool** (`lib/db.js`)
  - Environment-based configuration (development/production/test)
  - Query execution with performance logging and slow query detection
  - Pool error handling and connection lifecycle events
  - Singleton database instance

#### Database Schema
- **EVM Explorer Schema** (`sql/create.tables.sql`)
  - 8 core tables: blocks, addresses, transactions, logs, tokens, token_transfers, smart_contracts, internal_transactions
  - 40+ optimized indexes for query performance
  - Materialized view for token holder balances
  - Refresh function for token holder data

#### Database Management Scripts
- **Setup script** (`scripts/setup-db.js`)
  - Interactive database creation and validation
  - Table existence checking to prevent overwrites
  - Colorized output and progress feedback
  - SQL file execution with error handling

- **Reset script** (`scripts/reset-db.js`)
  - Interactive database teardown with safety confirmation
  - Active connection termination before drop
  - Warning messages for destructive operations

### Changed
- **README.md**: Updated database setup section (simplified "Option B" to "Quick setup")
- **.gitignore**: Added `data/` and `logs/` directories

### Dependencies
- Added `winston` ^3.18.3 for logging
- Added `pg` ^8.16.3 for PostgreSQL connectivity
- Added `dotenv` ^17.2.3 for environment configuration
- Added `readline` ^1.3.0 for interactive CLI prompts

### Scripts
- Added `db:setup` - Initialize database with schema
- Added `db:reset` - Drop and reset database (with confirmation)

## [0.0.1] - 2025-10-26

### Added
- Initial project setup
- Basic package.json with GPL license
- README with project name

---

[0.0.5]: https://github.com/b-rucel/pulseexplorer/compare/v0.0.4...v0.0.5
[0.0.4]: https://github.com/b-rucel/pulseexplorer/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/b-rucel/pulseexplorer/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/b-rucel/pulseexplorer/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/b-rucel/pulseexplorer/releases/tag/v0.0.1
