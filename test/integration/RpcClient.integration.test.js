require('dotenv').config();
const RpcClient = require('../../src/indexer/RpcClient');

// Set longer timeout for integration tests (real network calls)
jest.setTimeout(30000);

describe('RpcClient Integration Tests', () => {
  let isConnected = false;

  beforeAll(async () => {
    try {
      await RpcClient.connect();
      isConnected = true;
    } catch (error) {
      console.error('Failed to connect to RPC:', error.message);
      console.log('Skipping integration tests - RPC not available');
    }
  });

  afterAll(async () => {
    if (isConnected) {
      await RpcClient.close();
    }
  });

  // Helper to skip tests if not connected
  // const itIfConnected = isConnected ? it : it;

  describe('Connection', () => {
    it('should be connected to RPC', () => {
      expect(RpcClient.isConnected).toBe(true);
      expect(RpcClient.httpProvider).toBeDefined();
    });

    it('should have HTTP provider initialized', () => {
      expect(RpcClient.httpProvider).not.toBeNull();
    });
  });

  describe('getBlockNumber()', () => {
    it('should fetch current block number', async () => {
      const blockNumber = await RpcClient.getBlockNumber();

      expect(blockNumber).toBeGreaterThan(0);
      expect(typeof blockNumber).toBe('number');
    });

    it('should return increasing block numbers over time', async () => {
      const blockNumber1 = await RpcClient.getBlockNumber();

      // Wait a bit for new blocks
      await RpcClient.sleep(10000); // 10 seconds

      const blockNumber2 = await RpcClient.getBlockNumber();

      expect(blockNumber2).toBeGreaterThanOrEqual(blockNumber1);
    });
  });

  describe('getBlock()', () => {
    it('should fetch genesis block (block 0)', async () => {
      const block = await RpcClient.getBlock(0, true);

      expect(block).toBeDefined();
      expect(block.number).toBe(0);
      expect(block.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(block.parentHash).toBeDefined();
      expect(block.timestamp).toBe(0);
    });

    it('should fetch block 1 with transactions', async () => {
      const block = await RpcClient.getBlock(1, true);

      expect(block).toBeDefined();
      expect(block.number).toBe(1);
      expect(block.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(Array.isArray(block.transactions)).toBe(true);
    });

    it('should have valid block structure', async () => {
      const block = await RpcClient.getBlock(100, true);

      expect(block).toBeDefined();
      expect(block).toHaveProperty('number');
      expect(block).toHaveProperty('hash');
      expect(block).toHaveProperty('parentHash');
      expect(block).toHaveProperty('timestamp');
      expect(block).toHaveProperty('miner');
      expect(block).toHaveProperty('gasLimit');
      expect(block).toHaveProperty('gasUsed');
      expect(block).toHaveProperty('transactions');
    });

    it('should return null for non-existent future block', async () => {
      const currentBlock = await RpcClient.getBlockNumber();
      const futureBlock = currentBlock + 1000000;

      const block = await RpcClient.getBlock(futureBlock, true);

      expect(block).toBeNull();
    });

    it('should fetch block without full transactions', async () => {
      const block = await RpcClient.getBlock(1000, false);

      expect(block).toBeDefined();
      expect(block.number).toBe(1000);

      // Transactions should be hashes only, not full objects
      if (block.transactions.length > 0) {
        const firstTx = block.transactions[0];
        expect(typeof firstTx).toBe('string');
        expect(firstTx).toMatch(/^0x[a-fA-F0-9]{64}$/);
      }
    });
  });

  describe('getBlockRange()', () => {
    it('should fetch a small range of blocks sequentially', async () => {
      const startBlock = 100;
      const endBlock = 104;

      const blocks = await RpcClient.getBlockRange(startBlock, endBlock);

      expect(blocks).toHaveLength(5);
      expect(blocks[0].number).toBe(startBlock);
      expect(blocks[4].number).toBe(endBlock);

      // Verify sequential order
      for (let i = 0; i < blocks.length - 1; i++) {
        expect(blocks[i + 1].number).toBe(blocks[i].number + 1);
      }
    });

    it('should fetch single block range', async () => {
      const blocks = await RpcClient.getBlockRange(1, 1);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].number).toBe(1);
    });
  });

  describe('getBlocksParallel()', () => {
    it('should fetch blocks in parallel faster than sequential', async () => {
      const blockNumbers = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109];

      const startTime = Date.now();
      const blocks = await RpcClient.getBlocksParallel(blockNumbers, 5);
      const duration = Date.now() - startTime;

      expect(blocks).toHaveLength(10);
      expect(blocks[0].number).toBe(100);
      expect(blocks[9].number).toBe(109);

      // Parallel fetch should complete reasonably fast (under 10 seconds)
      expect(duration).toBeLessThan(10000);
    });

    it('should respect concurrency limit', async () => {
      const blockNumbers = Array.from({ length: 20 }, (_, i) => i + 1000);

      const blocks = await RpcClient.getBlocksParallel(blockNumbers, 3);

      expect(blocks).toHaveLength(20);
    });

    it('should handle mixed valid and invalid blocks', async () => {
      const currentBlock = await RpcClient.getBlockNumber();
      const futureBlock = currentBlock + 1000000;

      const blockNumbers = [1, 2, futureBlock, 3, 4];

      const blocks = await RpcClient.getBlocksParallel(blockNumbers, 5);

      // Should filter out the null (future) block
      expect(blocks.length).toBeLessThanOrEqual(4);
      expect(blocks.every(block => block !== null)).toBe(true);
    });
  });

  describe('healthCheck()', () => {
    it('should return true when RPC is healthy', async () => {
      const healthy = await RpcClient.healthCheck();

      expect(healthy).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should fetch a block within reasonable time', async () => {
      const startTime = Date.now();
      await RpcClient.getBlock(1000, true);
      const duration = Date.now() - startTime;

      // Should complete within 5 seconds
      expect(duration).toBeLessThan(5000);
    });

    it('should handle rapid sequential requests', async () => {
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(RpcClient.getBlock(1000 + i, false));
      }

      const blocks = await Promise.all(promises);

      expect(blocks).toHaveLength(5);
      blocks.forEach((block, index) => {
        expect(block.number).toBe(1000 + index);
      });
    });
  });
});
