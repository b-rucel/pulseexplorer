const { ethers } = require('ethers')
const logger = require('../../lib/logger');

const config = {
  http: process.env.RPC_URL || 'https://rpc.pulsechain.com',
  ws: process.env.RPC_WS_URL || 'wss://rpc.pulsechain.com',
  timeout: parseInt(process.env.RPC_TIMEOUT || '30000'),
  retries: parseInt(process.env.RPC_RETRIES || '3'),
};

class RpcClient {
  constructor() {
    this.httpProvider = null;
    this.wsProvider = null;
    this.isConnected = false;
  }

  /**
   * Connect to RPC
   */
  async connect() {
    try {
      logger.info('Connecting to RPC', {
        httpUrl: config.http,
        wsUrl: config.ws,
      });

      // initialize http provider
      this.httpProvider = new ethers.JsonRpcProvider(config.http, {
        name: 'pulsechain',
        chainId: 369,
      });

      // verify http connection
      const network = await this.httpProvider.getNetwork();
      logger.info('HTTP provider connected', {
        chainId: network.chainId.toString(),
      });

      // initialize websocket provider if configured
      if (config.ws) {
        try {
          this.wsProvider = new ethers.WebSocketProvider(config.ws, {
            name: 'pulsechain',
            chainId: 369,
          });

          // handle websocket errors gracefully
          if (this.wsProvider._websocket) {
            this.wsProvider._websocket.on('error', (error) => {
              logger.warn('WebSocket error, falling back to HTTP', {
                error: error.message,
              });
              this.wsProvider = null;
            });
          }

          logger.info('WebSocket provider initialized');
        } catch (error) {
          logger.warn('WebSocket connection failed, will use HTTP only', {
            error: error.message,
          });
          this.wsProvider = null;
        }
      }

      this.isConnected = true;
      return true;
    } catch (error) {
      logger.error('Failed to connect to RPC', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Get current block number from blockchain
   * @returns {Promise<number>}
   */
  async getBlockNumber() {
    try {
      const blockNumber = await this.httpProvider.getBlockNumber();
      logger.debug('Current block number', { blockNumber });
      return blockNumber;
    } catch (error) {
      logger.error('Failed to get block number', { error: error.message });
      throw error;
    }
  }

  /**
   * Fetch a single block from RPC
   * @param {number} blockNumber - Block number to fetch
   * @param {boolean} includeTransactions - Include full transaction objects
   * @returns {Promise<object|null>}
   */
  async getBlock(blockNumber, includeTransactions = true) {
    const maxRetries = config.retries;
    let lastError = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        logger.debug('Fetching block from RPC', {
          blockNumber,
          includeTransactions,
          attempt: attempt + 1,
        });

        const block = await this.httpProvider.getBlock(blockNumber, includeTransactions);

        if (!block) {
          logger.warn('Block not found', { blockNumber });
          return null;
        }

        logger.debug('Block fetched successfully', {
          number: block.number,
          hash: block.hash,
          transactions: block.transactions.length,
          gasUsed: block.gasUsed.toString(),
        });

        return block;
      } catch (error) {
        lastError = error;
        logger.warn('RPC fetch attempt failed', {
          blockNumber,
          attempt: attempt + 1,
          maxRetries,
          error: error.message,
        });

        // Wait before retry (exponential backoff)
        if (attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          logger.debug(`Retrying in ${delay}ms`);
          await this.sleep(delay);
        }
      }
    }

    // All retries failed
    logger.error('Failed to fetch block after all retries', {
      blockNumber,
      maxRetries,
      error: lastError.message,
    });
    throw lastError;
  }

  /**
   * Fetch multiple blocks sequentially
   * @param {number} fromBlock
   * @param {number} toBlock
   * @returns {Promise<Array>}
   */
  async getBlockRange(fromBlock, toBlock) {
    logger.info('Fetching block range', { fromBlock, toBlock });

    const blocks = [];
    const startTime = Date.now();

    for (let blockNum = fromBlock; blockNum <= toBlock; blockNum++) {
      try {
        const block = await this.getBlock(blockNum, true);
        if (block) {
          blocks.push(block);
        }
      } catch (error) {
        logger.error('Failed to fetch block in range', {
          blockNumber: blockNum,
          error: error.message,
        });
        throw error;
      }
    }

    const duration = Date.now() - startTime;
    logger.info('Block range fetched', {
      count: blocks.length,
      duration: `${duration}ms`,
      avgPerBlock: `${(duration / blocks.length).toFixed(2)}ms`,
    });

    return blocks;
  }

  /**
   * Fetch multiple blocks in parallel (faster)
   * @param {Array<number>} blockNumbers
   * @param {number} concurrency - Max parallel requests
   * @returns {Promise<Array>}
   */
  async getBlocksParallel(blockNumbers, concurrency = 10) {
    logger.info('Fetching blocks in parallel', {
      count: blockNumbers.length,
      concurrency,
    });

    const startTime = Date.now();
    const blocks = [];

    // Process in chunks to limit concurrent requests
    for (let i = 0; i < blockNumbers.length; i += concurrency) {
      const chunk = blockNumbers.slice(i, i + concurrency);

      try {
        const chunkBlocks = await Promise.all(
          chunk.map(blockNum => this.getBlock(blockNum, true))
        );

        // Filter out null blocks
        const validBlocks = chunkBlocks.filter(block => block !== null);
        blocks.push(...validBlocks);

        logger.debug('Parallel chunk completed', {
          chunk: `${chunk[0]}-${chunk[chunk.length - 1]}`,
          fetched: validBlocks.length,
        });
      } catch (error) {
        logger.error('Failed to fetch parallel chunk', {
          chunk,
          error: error.message,
        });
        throw error;
      }
    }

    const duration = Date.now() - startTime;
    logger.info('Parallel fetch completed', {
      count: blocks.length,
      duration: `${duration}ms`,
      avgPerBlock: `${(duration / blocks.length).toFixed(2)}ms`,
    });

    return blocks;
  }

  /**
   * Health check - verify RPC connection is working
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    try {
      await this.httpProvider.getBlockNumber();
      return true;
    } catch (error) {
      logger.error('RPC health check failed', { error: error.message });
      return false;
    }
  }

  /**
   * Close connections
   */
  async close() {
    if (this.wsProvider) {
      await this.wsProvider.destroy();
      logger.info('WebSocket provider closed');
    }
    this.isConnected = false;
    logger.info('RPC client closed');
  }

  /**
   * Utility: Sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new RpcClient();
