# Pulse Explorer

A high-performance blockchain indexer and explorer for PulseChain (EVM-compatible chain, chainId 369).

## Features
- **Parallel Block Processing** - Index multiple batches concurrently for 5x faster sync
- **Automatic Retry Logic** - Exponential backoff for failed RPC requests
- **Reorg Detection** - Automatically handles blockchain reorganizations
- **PostgreSQL Storage** - Efficient storage with proper indexing and BYTEA support
- **Comprehensive Logging** - Structured JSON logging with Winston
- **Fault Tolerant** - Failed batches don't stop the entire indexing process
- **Graceful Shutdown** - Clean shutdown with SIGINT/SIGTERM handling

### Core Components
- **RpcClient** - Manages RPC connections with retry logic
- **BlockFetcher** - Orchestrates parallel batch processing
- **BlockStorage** - Handles data transformation and PostgreSQL persistence
- **Database Layer** - Connection pooling and transaction management


## Quick Start

### Prerequisites
- Node.js 18+ (or Bun)
- PostgreSQL 14+
- PulseChain RPC endpoint

### Installation
```bash
# Clone the repository
git clone https://github.com/yourusername/pulseexplorer.git
cd pulseexplorer

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
nano .env
```

### Docker PostgreSQL Setup (Recommended)
If you don't have PostgreSQL installed locally, use Docker:
```bash
# Start PostgreSQL with Docker
docker run -d \
  --name pulseexplorer-postgres \
  -e POSTGRES_PASSWORD=yourpassword \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=pulsechain_explorer \
  -p 5432:5432 \
  -v pulseexplorer-data:/var/lib/postgresql/data \
  postgres:16-alpine

# Verify it's running
docker ps

# View logs
docker logs pulseexplorer-postgres

# Stop the container
docker stop pulseexplorer-postgres

# Start the container again
docker start pulseexplorer-postgres

# Remove the container and volume (WARNING: destroys all data)
docker stop pulseexplorer-postgres
docker rm pulseexplorer-postgres
docker volume rm pulseexplorer-data
```


### Database Setup
```bash
# Create database and tables
npm run db:setup

# Or reset database (WARNING: destroys all data)
npm run db:reset
```


### Running the Indexer
```bash
npm run indexer
>>>
============================================================
PulseChain Explorer - Blockchain Indexer
============================================================
Configuration loaded: {
  database: 'localhost:5432/pulsechain_explorer',
  rpcUrl: 'https://rpc.pulsechain.com',
  startBlock: 0,
  batchSize: 50
}
✓ Database connected
✓ BlockFetcher initialized
============================================================
Starting indexer...
Press Ctrl+C to stop gracefully
============================================================
Starting parallel sync: {
  totalBatches: 100,
  batchSize: 50,
  parallelBatches: 5,
  totalBlocks: 5000
}
Processing parallel chunk: 1-5 of 100 (0.00%)
Batch completed: 0-49 (1/100)
...
```


## Testing
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration
```

Current test coverage:
- 63 total tests
- Unit tests: BlockFetcher, RpcClient
- Integration tests: RpcClient live testing
- Coverage threshold: 50%


## Performance
With default configuration (`INDEXER_BATCH_SIZE=50`, `INDEXER_PARALLEL_BATCHES=5`):

- **~250 blocks/second** during historical sync
- **5x faster** than sequential processing
- Automatic retry with exponential backoff
- Fault-tolerant parallel processing

Tuning tips:
- Increase `INDEXER_PARALLEL_BATCHES` for faster sync (watch RPC rate limits)
- Increase `INDEXER_BATCH_SIZE` for larger batches
- Add `INDEXER_BLOCK_DELAY` if hitting rate limits


## Database Schema

8 core tables for comprehensive blockchain data:

| Table | Description |
|-------|-------------|
| `blocks` | Block headers and metadata |
| `transactions` | Transaction data with EIP-1559 support |
| `addresses` | Address registry with contract detection |
| `logs` | Event logs with indexed topics |
| `tokens` | ERC-20/721/1155 token metadata |
| `token_transfers` | Token transfer events |
| `smart_contracts` | Verified contract source code |
| `internal_transactions` | Contract call traces |

See [sql/create.tables.sql](sql/create.tables.sql) for full schema.


## Project Structure
```
pulseexplorer/
├── src/
│   └── indexer/
│       ├── index.js           # Main entry point
│       ├── BlockFetcher.js    # Parallel batch orchestration
│       ├── RpcClient.js       # RPC communication
│       └── BlockStorage.js    # Database persistence
├── lib/
│   ├── db.js                  # PostgreSQL connection pool
│   ├── logger.js              # Winston logging
│   └── colors.js              # Terminal colors
├── scripts/
│   ├── setup-db.js            # Database initialization
│   └── reset-db.js            # Database reset
├── sql/
│   └── create.tables.sql      # Database schema
├── test/
│   ├── indexer/               # Unit tests
│   └── integration/           # Integration tests
└── logs/                      # Log files
```

## Roadmap
- [ ] Transaction indexing
- [ ] Event log parsing
- [ ] Token transfer tracking
- [ ] REST API for queries
- [ ] WebSocket real-time updates
- [ ] Smart contract verification
- [ ] Internal transaction tracing
