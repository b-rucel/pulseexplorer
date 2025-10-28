#!/usr/bin/env node

/**
 * Main entry point for PulseChain blockchain indexer
 *
 * This script:
 * - Initializes the BlockFetcher
 * - Starts the indexing process
 * - Handles graceful shutdown
 * - Monitors indexing progress
 */

require('dotenv').config()
const blockFetcher = require('./BlockFetcher');
const db = require('../../lib/db');
const logger = require('../../lib/logger');

const config = {
  env: process.env.NODE_ENV || 'development',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'pulsechain_explorer',
  },
  rpc: {
    http: process.env.RPC_URL || 'https://pulsechain-rpc.publicnode.com',
  },
  indexer: {
    startBlock: parseInt(process.env.INDEXER_START_BLOCK || '0'),
    batchSize: parseInt(process.env.INDEXER_BATCH_SIZE || '50'),
  },
};

// Track if shutdown is in progress
let isShuttingDown = false;

/**
 * Main function
 */
async function main() {
  try {
    logger.info('='.repeat(60));
    logger.info('PulseChain Explorer - Blockchain Indexer');
    logger.info('='.repeat(60));

    // Display configuration
    logger.info('Configuration loaded:', {
      database: `${config.db.host}:${config.db.port}/${config.db.database}`,
      rpcUrl: config.rpc.http,
      startBlock: config.indexer.startBlock,
      batchSize: config.indexer.batchSize,
      environment: config.env,
    });

    // Check database connection
    logger.info('Checking database connection...');
    const dbHealthy = await db.healthCheck();
    if (!dbHealthy) {
      throw new Error('Database connection failed');
    }
    logger.info('✓ Database connected');

    // Initialize BlockFetcher
    logger.info('Initializing BlockFetcher...');
    await blockFetcher.initialize();
    logger.info('✓ BlockFetcher initialized');

    // Display initial stats
    const initialStats = await blockFetcher.getStats();
    logger.info('Initial indexing state:', {
      chainHeight: initialStats.chainHeight,
      indexed: initialStats.indexed,
      behind: initialStats.behind,
      progress: initialStats.progress,
    });

    logger.info('='.repeat(60));
    logger.info('Starting indexer...');
    logger.info('Press Ctrl+C to stop gracefully');
    logger.info('='.repeat(60));

    // Start indexing
    await blockFetcher.start();

  } catch (error) {
    logger.error('Fatal error in indexer', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 */
async function shutdown(signal) {
  if (isShuttingDown) {
    logger.warn('Shutdown already in progress...');
    return;
  }

  isShuttingDown = true;

  logger.info('='.repeat(60));
  logger.info(`Received ${signal}, shutting down gracefully...`);
  logger.info('='.repeat(60));

  try {
    // Stop BlockFetcher
    logger.info('Stopping BlockFetcher...');
    await blockFetcher.stop();
    logger.info('✓ BlockFetcher stopped');

    // Display final stats
    const finalStats = await blockFetcher.getStats();
    logger.info('Final indexing state:', {
      chainHeight: finalStats.chainHeight,
      indexed: finalStats.indexed,
      totalTransactions: finalStats.totalTransactions,
      progress: finalStats.progress,
    });

    // Close database connection
    logger.info('Closing database connection...');
    await db.close();
    logger.info('✓ Database closed');

    logger.info('='.repeat(60));
    logger.info('Shutdown complete');
    logger.info('='.repeat(60));

    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

// Register signal handlers for graceful shutdown
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack,
  });
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', {
    reason,
    promise,
  });
  shutdown('unhandledRejection');
});

// Start the indexer
main();
