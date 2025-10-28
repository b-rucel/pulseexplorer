// Mock logger first
jest.mock('../../lib/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Mock RpcClient
const mockRpcClient = {
  connect: jest.fn(),
  getBlockNumber: jest.fn(),
  getBlockRange: jest.fn(),
  close: jest.fn(),
  healthCheck: jest.fn(),
};

jest.mock('../../src/indexer/RpcClient', () => mockRpcClient);

// Mock BlockStorage
const mockBlockStorage = {
  getLastBlockNumber: jest.fn(),
  saveBlocks: jest.fn(),
  getBlock: jest.fn(),
  deleteBlocksFrom: jest.fn(),
  getStats: jest.fn(),
};

jest.mock('../../src/indexer/BlockStorage', () => mockBlockStorage);

const logger = require('../../lib/logger');

// Require BlockFetcher after mocks are set up
const blockFetcher = require('../../src/indexer/BlockFetcher');

describe('BlockFetcher Unit Tests', () => {
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Reset BlockFetcher state
    blockFetcher.isRunning = false;
    blockFetcher.currentBlock = null;
    blockFetcher.retryCount = 0;
  });

  afterEach(() => {
    blockFetcher.isRunning = false;
  });

  describe('initialize()', () => {
    it('should initialize successfully with existing indexed blocks', async () => {
      mockRpcClient.connect.mockResolvedValue(true);
      mockRpcClient.getBlockNumber.mockResolvedValue(10000);
      mockBlockStorage.getLastBlockNumber.mockResolvedValue(5000);

      const result = await blockFetcher.initialize();

      expect(result).toBe(true);
      expect(mockRpcClient.connect).toHaveBeenCalled();
      expect(mockRpcClient.getBlockNumber).toHaveBeenCalled();
      expect(mockBlockStorage.getLastBlockNumber).toHaveBeenCalled();
      expect(blockFetcher.currentBlock).toBe(5000);
      expect(logger.info).toHaveBeenCalledWith(
        'BlockFetcher initialized',
        expect.objectContaining({
          startingFrom: 5000,
          chainHeight: 10000,
          blocksToSync: 5000,
        })
      );
    });

    it('should initialize from START_BLOCK if no blocks indexed', async () => {
      mockRpcClient.connect.mockResolvedValue(true);
      mockRpcClient.getBlockNumber.mockResolvedValue(10000);
      mockBlockStorage.getLastBlockNumber.mockResolvedValue(null);

      await blockFetcher.initialize();

      expect(blockFetcher.currentBlock).toBe(0); // Default START_BLOCK
    });

    it('should throw error if RPC connection fails', async () => {
      mockRpcClient.connect.mockRejectedValue(new Error('Connection failed'));

      await expect(blockFetcher.initialize()).rejects.toThrow('Connection failed');
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to initialize BlockFetcher',
        expect.any(Object)
      );
    });
  });

  describe('fetchAndSaveBatch()', () => {
    it('should fetch and save blocks successfully', async () => {
      const mockBlocks = [
        { number: 100, hash: '0xaaa', transactions: [] },
        { number: 101, hash: '0xbbb', transactions: [] },
      ];

      mockRpcClient.getBlockRange.mockResolvedValue(mockBlocks);
      mockBlockStorage.saveBlocks.mockResolvedValue(2);

      await blockFetcher.fetchAndSaveBatch(100, 101);

      expect(mockRpcClient.getBlockRange).toHaveBeenCalledWith(100, 101);
      expect(mockBlockStorage.saveBlocks).toHaveBeenCalledWith(mockBlocks);
      expect(logger.info).toHaveBeenCalledWith(
        'Batch saved',
        expect.objectContaining({
          from: 100,
          to: 101,
          fetched: 2,
          saved: 2,
        })
      );
    });

    it('should handle empty block array', async () => {
      mockRpcClient.getBlockRange.mockResolvedValue([]);

      await blockFetcher.fetchAndSaveBatch(100, 101);

      expect(mockBlockStorage.saveBlocks).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith('No blocks fetched', expect.any(Object));
    });

    it('should check for reorgs when enabled', async () => {
      const mockBlocks = [
        { number: 100, hash: '0xaaa', transactions: [] },
      ];

      mockRpcClient.getBlockRange.mockResolvedValue(mockBlocks);
      mockBlockStorage.saveBlocks.mockResolvedValue(1);
      mockBlockStorage.getBlock.mockResolvedValue(null);

      jest.spyOn(blockFetcher, 'checkForReorgs');

      await blockFetcher.fetchAndSaveBatch(100, 100);

      expect(blockFetcher.checkForReorgs).toHaveBeenCalledWith(mockBlocks);
    });
  });

  describe('fetchAndSaveBatchWithRetry()', () => {
    beforeEach(() => {
      jest.spyOn(blockFetcher, 'sleep').mockResolvedValue();
      jest.spyOn(blockFetcher, 'fetchAndSaveBatch');
    });

    it('should succeed on first attempt', async () => {
      blockFetcher.fetchAndSaveBatch.mockResolvedValue();

      await blockFetcher.fetchAndSaveBatchWithRetry(100, 120);

      expect(blockFetcher.fetchAndSaveBatch).toHaveBeenCalledTimes(1);
      expect(blockFetcher.sleep).not.toHaveBeenCalled();
    });

    it('should retry on failure and eventually succeed', async () => {
      blockFetcher.fetchAndSaveBatch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce();

      await blockFetcher.fetchAndSaveBatchWithRetry(100, 120);

      expect(blockFetcher.fetchAndSaveBatch).toHaveBeenCalledTimes(3);
      expect(blockFetcher.sleep).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledTimes(2);
    });

    it('should throw error after max retries', async () => {
      blockFetcher.fetchAndSaveBatch.mockRejectedValue(new Error('Persistent error'));

      await expect(
        blockFetcher.fetchAndSaveBatchWithRetry(100, 120)
      ).rejects.toThrow('Persistent error');

      expect(blockFetcher.fetchAndSaveBatch).toHaveBeenCalledTimes(4); // 1 + 3 retries
      expect(logger.error).toHaveBeenCalledWith(
        'Batch failed after all retries',
        expect.objectContaining({
          from: 100,
          to: 120,
          attempts: 4,
        })
      );
    });

    it('should use exponential backoff for retries', async () => {
      blockFetcher.fetchAndSaveBatch.mockRejectedValue(new Error('Error'));

      try {
        await blockFetcher.fetchAndSaveBatchWithRetry(100, 120);
      } catch (e) {
        // Expected to fail
      }

      expect(blockFetcher.sleep).toHaveBeenNthCalledWith(1, 2000);  // 2^1 * 1000
      expect(blockFetcher.sleep).toHaveBeenNthCalledWith(2, 4000);  // 2^2 * 1000
      expect(blockFetcher.sleep).toHaveBeenNthCalledWith(3, 8000);  // 2^3 * 1000
    });
  });

  describe('syncHistoricalBlocks() - Parallel Processing', () => {
    beforeEach(() => {
      jest.spyOn(blockFetcher, 'sleep').mockResolvedValue();
      jest.spyOn(blockFetcher, 'fetchAndSaveBatchWithRetry').mockResolvedValue();
      blockFetcher.isRunning = true;
    });

    it('should process batches in parallel chunks', async () => {
      // Blocks 0-99 with default config (check actual batch size from env)
      await blockFetcher.syncHistoricalBlocks(0, 99);

      // Should have been called some number of times based on batch size
      expect(blockFetcher.fetchAndSaveBatchWithRetry).toHaveBeenCalled();

      // First batch should start at 0
      const firstCall = blockFetcher.fetchAndSaveBatchWithRetry.mock.calls[0];
      expect(firstCall[0]).toBe(0);

      // Last batch should end at 99
      const lastCall = blockFetcher.fetchAndSaveBatchWithRetry.mock.calls[
        blockFetcher.fetchAndSaveBatchWithRetry.mock.calls.length - 1
      ];
      expect(lastCall[1]).toBe(99);
    });

    it('should process multiple parallel chunks for large ranges', async () => {
      await blockFetcher.syncHistoricalBlocks(0, 199);

      // Should have been called multiple times
      expect(blockFetcher.fetchAndSaveBatchWithRetry.mock.calls.length).toBeGreaterThan(1);

      expect(logger.info).toHaveBeenCalledWith(
        'Starting parallel sync',
        expect.objectContaining({
          totalBlocks: 200,
        })
      );
    });

    it('should update currentBlock to highest completed batch', async () => {
      blockFetcher.currentBlock = 0;

      await blockFetcher.syncHistoricalBlocks(0, 99);

      expect(blockFetcher.currentBlock).toBeGreaterThanOrEqual(99);
    });

    it('should handle partial failures and continue processing', async () => {
      // Mock first batch success, second batch fail, rest success
      let callCount = 0;
      blockFetcher.fetchAndSaveBatchWithRetry.mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Failed batch');
        }
      });

      await blockFetcher.syncHistoricalBlocks(0, 99);

      // Should log completion with some successes and failures
      const completionCall = logger.info.mock.calls.find(
        call => call[0] === 'Historical sync completed'
      );
      expect(completionCall).toBeDefined();
      expect(completionCall[1]).toHaveProperty('successfulBatches');
      expect(completionCall[1]).toHaveProperty('failedBatches');
      expect(completionCall[1].failedBatches).toBeGreaterThan(0);
    });

    it('should log failed batches summary', async () => {
      // Mock multiple failures
      let callCount = 0;
      blockFetcher.fetchAndSaveBatchWithRetry.mockImplementation(async () => {
        callCount++;
        if (callCount === 2 || callCount === 3) {
          throw new Error('Failed batch');
        }
      });

      await blockFetcher.syncHistoricalBlocks(0, 99);

      // Should log failed batches summary
      const warnCall = logger.warn.mock.calls.find(
        call => call[0] === 'Failed batches summary'
      );
      expect(warnCall).toBeDefined();
      expect(warnCall[1].count).toBe(2);
      expect(warnCall[1].batches).toHaveLength(2);
    });

    it('should respect isRunning flag and stop processing', async () => {
      // Set isRunning to false after first batch
      blockFetcher.fetchAndSaveBatchWithRetry.mockImplementation(async () => {
        blockFetcher.isRunning = false;
      });

      await blockFetcher.syncHistoricalBlocks(0, 199);

      // Should stop after first chunk (5 batches)
      expect(blockFetcher.fetchAndSaveBatchWithRetry).toHaveBeenCalledTimes(5);
    });

    it('should handle odd batch counts correctly', async () => {
      // 0-62 should create batches ending at 62
      await blockFetcher.syncHistoricalBlocks(0, 62);

      // Should have been called at least once
      expect(blockFetcher.fetchAndSaveBatchWithRetry).toHaveBeenCalled();

      // Last batch should end at 62
      const lastCall = blockFetcher.fetchAndSaveBatchWithRetry.mock.calls[
        blockFetcher.fetchAndSaveBatchWithRetry.mock.calls.length - 1
      ];
      expect(lastCall[1]).toBe(62);
    });
  });

  describe('checkForReorgs()', () => {
    it('should not detect reorg when hashes match', async () => {
      const mockBlocks = [
        { number: 100, hash: '0xabc123', transactions: [] },
      ];

      const existingBlock = {
        hash: Buffer.from('abc123', 'hex'),
      };

      mockBlockStorage.getBlock.mockResolvedValue(existingBlock);

      await blockFetcher.checkForReorgs(mockBlocks);

      expect(mockBlockStorage.deleteBlocksFrom).not.toHaveBeenCalled();
    });

    it('should detect and handle reorg when hashes differ', async () => {
      const mockBlocks = [
        { number: 100, hash: '0xabc123', transactions: [] },
      ];

      const existingBlock = {
        hash: Buffer.from('def456', 'hex'), // Different hash
      };

      mockBlockStorage.getBlock.mockResolvedValue(existingBlock);
      mockBlockStorage.deleteBlocksFrom.mockResolvedValue(10);
      blockFetcher.currentBlock = 150;

      await blockFetcher.checkForReorgs(mockBlocks);

      expect(logger.warn).toHaveBeenCalledWith(
        'Reorg detected!',
        expect.objectContaining({
          blockNumber: 100,
          existingHash: '0xdef456',
          newHash: '0xabc123',
        })
      );
      expect(mockBlockStorage.deleteBlocksFrom).toHaveBeenCalledWith(100);
      expect(blockFetcher.currentBlock).toBe(99);
    });

    it('should skip genesis block in reorg check', async () => {
      const mockBlocks = [
        { number: 0, hash: '0xgenesis', transactions: [] },
      ];

      await blockFetcher.checkForReorgs(mockBlocks);

      expect(mockBlockStorage.getBlock).not.toHaveBeenCalled();
    });

    it('should handle block not existing in database', async () => {
      const mockBlocks = [
        { number: 100, hash: '0xabc123', transactions: [] },
      ];

      mockBlockStorage.getBlock.mockResolvedValue(null);

      await blockFetcher.checkForReorgs(mockBlocks);

      expect(mockBlockStorage.deleteBlocksFrom).not.toHaveBeenCalled();
    });
  });

  describe('stop()', () => {
    it('should stop the fetcher and close RPC connection', async () => {
      blockFetcher.isRunning = true;
      mockRpcClient.close.mockResolvedValue();

      await blockFetcher.stop();

      expect(blockFetcher.isRunning).toBe(false);
      expect(mockRpcClient.close).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('BlockFetcher stopped');
    });
  });

  describe('getStats()', () => {
    it('should return combined stats from RPC and storage', async () => {
      mockRpcClient.getBlockNumber.mockResolvedValue(10000);
      mockBlockStorage.getStats.mockResolvedValue({
        totalBlocks: 5000,
        lastBlock: 5000,
        firstBlock: 0,
        totalTransactions: 50000,
      });

      const stats = await blockFetcher.getStats();

      expect(stats).toEqual({
        chainHeight: 10000,
        indexed: 5000,
        behind: 5000,
        progress: '50.00%',
        totalBlocks: 5000,
        lastBlock: 5000,
        firstBlock: 0,
        totalTransactions: 50000,
      });
    });

    it('should handle no blocks indexed yet', async () => {
      mockRpcClient.getBlockNumber.mockResolvedValue(10000);
      mockBlockStorage.getStats.mockResolvedValue({
        totalBlocks: 0,
        lastBlock: null,
        firstBlock: null,
        totalTransactions: 0,
      });

      const stats = await blockFetcher.getStats();

      expect(stats.progress).toBe('0%');
      expect(stats.behind).toBe(10000);
    });
  });

  describe('sleep()', () => {
    it('should resolve after specified milliseconds', async () => {
      jest.useFakeTimers();

      const sleepPromise = blockFetcher.sleep(1000);
      jest.advanceTimersByTime(1000);

      await expect(sleepPromise).resolves.toBeUndefined();

      jest.useRealTimers();
    });
  });
});
