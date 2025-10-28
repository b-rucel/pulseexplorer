const rpcClient = require('./RpcClient');
const blockStorage = require('./BlockStorage');
const logger = require('../../lib/logger');

const config = {
  rpc: {
    retries: parseInt(process.env.RPC_RETRIES || '3'),
  },
  indexer: {
    startBlock: parseInt(process.env.INDEXER_START_BLOCK || '0'),
    batchSize: parseInt(process.env.INDEXER_BATCH_SIZE || '100'),
    blockDelay: parseInt(process.env.INDEXER_BLOCK_DELAY || '0'),
    enableReorgCheck: process.env.INDEXER_ENABLE_REORG_CHECK !== 'false',
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
   * Sync historical blocks in batches
   * @param {number} fromBlock - Starting block number
   * @param {number} toBlock - Ending block number
   */
  async syncHistoricalBlocks(fromBlock, toBlock) {
    const batchSize = config.indexer.batchSize;
    let currentBatch = fromBlock;

    while (currentBatch <= toBlock && this.isRunning) {
      const endBlock = Math.min(currentBatch + batchSize - 1, toBlock);

      logger.info('Syncing batch', {
        from: currentBatch,
        to: endBlock,
        progress: `${((currentBatch - fromBlock) / (toBlock - fromBlock) * 100).toFixed(2)}%`,
      });

      try {
        await this.fetchAndSaveBatch(currentBatch, endBlock);
        currentBatch = endBlock + 1;
        this.currentBlock = endBlock;
        this.retryCount = 0; // Reset retry count on success

      } catch (error) {
        logger.error('Failed to sync batch', {
          from: currentBatch,
          to: endBlock,
          error: error.message,
        });

        // Retry with exponential backoff
        if (this.retryCount < this.maxRetries) {
          this.retryCount++;
          const delay = Math.pow(2, this.retryCount) * 1000;
          logger.info(`Retrying in ${delay}ms (attempt ${this.retryCount}/${this.maxRetries})`);
          await this.sleep(delay);
        } else {
          logger.error('Max retries reached, skipping batch', {
            from: currentBatch,
            to: endBlock,
          });
          currentBatch = endBlock + 1;
          this.retryCount = 0;
        }
      }

      // Optional delay between batches to avoid overwhelming RPC
      if (config.indexer.blockDelay > 0) {
        await this.sleep(config.indexer.blockDelay);
      }
    }

    logger.info('Historical sync completed', {
      lastBlock: toBlock,
    });
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
