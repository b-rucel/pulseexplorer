# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.0.3]: https://github.com/b-rucel/pulseexplorer/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/b-rucel/pulseexplorer/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/b-rucel/pulseexplorer/releases/tag/v0.0.1
