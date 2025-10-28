const rpcClient = require('./RpcClient');
const blockStorage = require('./BlockStorage');
const logger = require('../../lib/logger');

const config = {
  rpc: {
    retries: parseInt(process.env.RPC_RETRIES || '3'),
  },
  indexer: {
    startBlock: parseInt(process.env.INDEXER_START_BLOCK || '0'),
    batchSize: parseInt(process.env.INDEXER_BATCH_SIZE || '10'),
    blockDelay: parseInt(process.env.INDEXER_BLOCK_DELAY || '0'),
    enableReorgCheck: process.env.INDEXER_ENABLE_REORG_CHECK !== 'false',
    parallelBatches: parseInt(process.env.INDEXER_PARALLEL_BATCHES || '5'),
  },
}

/**
 * BlockFetcher - Coordinates blockchain indexing strategy
 *
 * Responsibilities:
 * - Manages indexing strategy (historical vs real-time)
 * - Coordinates between RpcClient and BlockStorage
 * - Handles blockchain reorganizations
 * - Implements retry logic for failed batches
 * - Tracks indexing progress
 *
 * Does NOT:
 * - Directly fetch from RPC (delegates to RpcClient)
 * - Directly save to database (delegates to BlockStorage)
 * - Know about ethers.js or PostgreSQL details
 */
class BlockFetcher {
  constructor() {
    this.currentBlock = null;
    this.isRunning = false;
    this.retryCount = 0;
    this.maxRetries = config.rpc.retries;
  }

  /**
   * Initialize the block fetcher
   */
  async initialize() {
    try {
      logger.info('Initializing BlockFetcher');

      // Connect to RPC
      await rpcClient.connect();

      // Get current blockchain height
      const chainHeight = await rpcClient.getBlockNumber();
      logger.info('Current blockchain height', { blockNumber: chainHeight });

      // Get last indexed block from database
      const lastIndexedBlock = await blockStorage.getLastBlockNumber();
      this.currentBlock = lastIndexedBlock || config.indexer.startBlock;

      logger.info('BlockFetcher initialized', {
        startingFrom: this.currentBlock,
        chainHeight: chainHeight,
        blocksToSync: chainHeight - this.currentBlock,
      });

      return true;
    } catch (error) {
      logger.error('Failed to initialize BlockFetcher', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Start the block fetcher
   * - Backfills historical blocks
   * - Subscribes to new blocks (or polls)
   */
  async start() {
    if (this.isRunning) {
      logger.warn('BlockFetcher is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting BlockFetcher');

    try {
      // Get current chain height
      const chainHeight = await rpcClient.getBlockNumber();

      // If we're behind, do historical sync first
      if (this.currentBlock < chainHeight) {
        logger.info('Starting historical sync', {
          from: this.currentBlock + 1,
          to: chainHeight,
          blocks: chainHeight - this.currentBlock,
        });

        await this.syncHistoricalBlocks(this.currentBlock + 1, chainHeight);
      }

      // After historical sync, start real-time syncing
      logger.info('Historical sync complete, starting real-time sync');
      await this.startRealTimeSync();

    } catch (error) {
      logger.error('Error in BlockFetcher', { error: error.message });
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Sync historical blocks in batches with parallel processing
   * @param {number} fromBlock - Starting block number
   * @param {number} toBlock - Ending block number
   */
  async syncHistoricalBlocks(fromBlock, toBlock) {
    const batchSize = config.indexer.batchSize;
    const parallelBatches = config.indexer.parallelBatches;

    // Create array of all batch ranges to process
    const batches = [];
    for (let start = fromBlock; start <= toBlock; start += batchSize) {
      const end = Math.min(start + batchSize - 1, toBlock);
      batches.push({ from: start, to: end });
    }

    logger.info('Starting parallel sync', {
      totalBatches: batches.length,
      batchSize,
      parallelBatches,
      totalBlocks: toBlock - fromBlock + 1,
    });

    let processedBatches = 0;
    let failedBatches = [];

    // Process batches in parallel with concurrency control
    for (let i = 0; i < batches.length && this.isRunning; i += parallelBatches) {
      const chunk = batches.slice(i, i + parallelBatches);

      logger.info('Processing parallel chunk', {
        chunk: `${i + 1}-${Math.min(i + parallelBatches, batches.length)} of ${batches.length}`,
        progress: `${((i / batches.length) * 100).toFixed(2)}%`,
      });

      // Process this chunk of batches in parallel
      const results = await Promise.allSettled(
        chunk.map(batch => this.fetchAndSaveBatchWithRetry(batch.from, batch.to))
      );

      // Track results
      results.forEach((result, idx) => {
        const batch = chunk[idx];
        if (result.status === 'fulfilled') {
          processedBatches++;
          this.currentBlock = Math.max(this.currentBlock, batch.to);
          logger.info('Batch completed', {
            from: batch.from,
            to: batch.to,
            completed: processedBatches,
            total: batches.length,
          });
        } else {
          failedBatches.push({ ...batch, error: result.reason.message });
          logger.error('Batch failed after retries', {
            from: batch.from,
            to: batch.to,
            error: result.reason.message,
          });
        }
      });

      // Optional delay between parallel chunks
      if (config.indexer.blockDelay > 0 && i + parallelBatches < batches.length) {
        await this.sleep(config.indexer.blockDelay);
      }
    }

    // Summary
    logger.info('Historical sync completed', {
      lastBlock: toBlock,
      successfulBatches: processedBatches,
      failedBatches: failedBatches.length,
    });

    if (failedBatches.length > 0) {
      logger.warn('Failed batches summary', {
        count: failedBatches.length,
        batches: failedBatches.map(b => `${b.from}-${b.to}`),
      });
    }
  }

  /**
   * Fetch and save a batch with retry logic
   * @param {number} fromBlock
   * @param {number} toBlock
   * @returns {Promise<void>}
   */
  async fetchAndSaveBatchWithRetry(fromBlock, toBlock) {
    let retryCount = 0;
    const maxRetries = this.maxRetries;

    while (retryCount <= maxRetries) {
      try {
        await this.fetchAndSaveBatch(fromBlock, toBlock);
        return; // Success
      } catch (error) {
        retryCount++;

        if (retryCount > maxRetries) {
          logger.error('Batch failed after all retries', {
            from: fromBlock,
            to: toBlock,
            attempts: retryCount,
            error: error.message,
          });
          throw error;
        }

        const delay = Math.pow(2, retryCount) * 1000;
        logger.warn('Batch failed, retrying', {
          from: fromBlock,
          to: toBlock,
          attempt: retryCount,
          maxRetries,
          retryIn: `${delay}ms`,
          error: error.message,
        });

        await this.sleep(delay);
      }
    }
  }

  /**
   * Fetch and save a batch of blocks
   * @param {number} fromBlock
   * @param {number} toBlock
   */
  async fetchAndSaveBatch(fromBlock, toBlock) {
    // Fetch blocks from RPC
    const blocks = await rpcClient.getBlockRange(fromBlock, toBlock);

    if (blocks.length === 0) {
      logger.warn('No blocks fetched', { fromBlock, toBlock });
      return;
    }

    // Check for reorgs if enabled
    if (config.indexer.enableReorgCheck) {
      await this.checkForReorgs(blocks);
    }

    // Save blocks to database
    const savedCount = await blockStorage.saveBlocks(blocks);

    logger.info('Batch saved', {
      from: fromBlock,
      to: toBlock,
      fetched: blocks.length,
      saved: savedCount,
    });
  }

  /**
   * Check for blockchain reorganizations
   * @param {Array<object>} blocks - Array of blocks to check
   */
  async checkForReorgs(blocks) {
    for (const block of blocks) {
      if (block.number === 0) continue; // Skip genesis block

      // Check if block already exists
      const existingBlock = await blockStorage.getBlock(block.number);

      if (existingBlock) {
        const existingHash = '0x' + existingBlock.hash.toString('hex');

        if (existingHash !== block.hash) {
          logger.warn('Reorg detected!', {
            blockNumber: block.number,
            existingHash,
            newHash: block.hash,
          });

          // Delete blocks from this point onwards
          const deletedCount = await blockStorage.deleteBlocksFrom(block.number);

          logger.info('Removed blocks due to reorg', {
            fromBlock: block.number,
            deletedCount,
          });

          // Update current block pointer
          this.currentBlock = block.number - 1;

          break; // Stop checking, we'll re-fetch from here
        }
      }
    }
  }

  /**
   * Start real-time sync (polling-based)
   * Continuously polls for new blocks
   */
  async startRealTimeSync() {
    const pollInterval = 12000; // 12 seconds (PulseChain block time)

    logger.info('Starting real-time sync (polling mode)', {
      interval: `${pollInterval}ms`,
    });

    while (this.isRunning) {
      try {
        const chainHeight = await rpcClient.getBlockNumber();

        if (chainHeight > this.currentBlock) {
          logger.info('New blocks detected', {
            from: this.currentBlock + 1,
            to: chainHeight,
            newBlocks: chainHeight - this.currentBlock,
          });

          await this.syncHistoricalBlocks(this.currentBlock + 1, chainHeight);
        }

      } catch (error) {
        logger.error('Error in real-time sync', { error: error.message });
      }

      // Wait before next poll
      await this.sleep(pollInterval);
    }
  }

  /**
   * Stop the block fetcher
   */
  async stop() {
    logger.info('Stopping BlockFetcher');
    this.isRunning = false;

    // Close RPC connection
    await rpcClient.close();

    logger.info('BlockFetcher stopped');
  }

  /**
   * Get indexing statistics
   * @returns {Promise<object>}
   */
  async getStats() {
    const chainHeight = await rpcClient.getBlockNumber();
    const dbStats = await blockStorage.getStats();

    return {
      chainHeight,
      indexed: dbStats.totalBlocks,
      behind: chainHeight - (dbStats.lastBlock || 0),
      progress: dbStats.lastBlock ? ((dbStats.lastBlock / chainHeight) * 100).toFixed(2) + '%' : '0%',
      ...dbStats,
    };
  }

  /**
   * Utility: Sleep for specified milliseconds
   * @param {number} ms
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton instance
module.exports = new BlockFetcher();
