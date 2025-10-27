// Mock logger first
jest.mock('../../lib/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Mock ethers
const mockHttpProvider = {
  getNetwork: jest.fn(),
  getBlockNumber: jest.fn(),
  getBlock: jest.fn(),
};

const mockWsProvider = {
  _websocket: {
    on: jest.fn(),
  },
  destroy: jest.fn(),
};

jest.mock('ethers', () => ({
  ethers: {
    JsonRpcProvider: jest.fn(() => mockHttpProvider),
    WebSocketProvider: jest.fn(() => mockWsProvider),
  },
}));

const { ethers } = require('ethers');
const RpcClient = require('../../src/indexer/RpcClient');

describe('RpcClient Unit Tests', () => {
  beforeEach(() => {
    // Clear all mocks but keep implementations
    jest.clearAllMocks();

    // Reset RpcClient state
    RpcClient.isConnected = false;
    RpcClient.httpProvider = null;
    RpcClient.wsProvider = null;
  });

  describe('connect()', () => {
    it('should connect to HTTP provider successfully', async () => {
      mockHttpProvider.getNetwork.mockResolvedValue({ chainId: 369n });

      const result = await RpcClient.connect();

      expect(result).toBe(true);
      expect(RpcClient.isConnected).toBe(true);
      expect(ethers.JsonRpcProvider).toHaveBeenCalledWith(
        expect.any(String),
        { name: 'pulsechain', chainId: 369 }
      );
      expect(mockHttpProvider.getNetwork).toHaveBeenCalled();
    });

    it('should initialize WebSocket provider if configured', async () => {
      mockHttpProvider.getNetwork.mockResolvedValue({ chainId: 369n });

      await RpcClient.connect();

      expect(ethers.WebSocketProvider).toHaveBeenCalled();
      expect(RpcClient.wsProvider).toBe(mockWsProvider);
    });

    it('should handle WebSocket connection failure gracefully', async () => {
      mockHttpProvider.getNetwork.mockResolvedValue({ chainId: 369n });
      ethers.WebSocketProvider.mockImplementation(() => {
        throw new Error('WebSocket connection failed');
      });

      await RpcClient.connect();

      expect(RpcClient.isConnected).toBe(true);
      expect(RpcClient.wsProvider).toBe(null);
    });

    it('should throw error if HTTP connection fails', async () => {
      mockHttpProvider.getNetwork.mockRejectedValue(new Error('Connection refused'));

      await expect(RpcClient.connect()).rejects.toThrow('Connection refused');
      expect(RpcClient.isConnected).toBe(false);
    });
  });

  describe('getBlockNumber()', () => {
    beforeEach(() => {
      RpcClient.httpProvider = mockHttpProvider;
    });

    it('should return current block number', async () => {
      mockHttpProvider.getBlockNumber.mockResolvedValue(12345678);

      const result = await RpcClient.getBlockNumber();

      expect(result).toBe(12345678);
      expect(mockHttpProvider.getBlockNumber).toHaveBeenCalled();
    });

    it('should throw error if RPC call fails', async () => {
      mockHttpProvider.getBlockNumber.mockRejectedValue(new Error('RPC error'));

      await expect(RpcClient.getBlockNumber()).rejects.toThrow('RPC error');
    });
  });

  describe('getBlock()', () => {
    beforeEach(() => {
      RpcClient.httpProvider = mockHttpProvider;
      // Speed up tests by mocking sleep
      jest.spyOn(RpcClient, 'sleep').mockResolvedValue();
    });

    it('should fetch a block successfully', async () => {
      const mockBlock = {
        number: 12345,
        hash: '0xabc123',
        transactions: ['0xtx1', '0xtx2'],
        gasUsed: 21000n,
      };

      mockHttpProvider.getBlock.mockResolvedValue(mockBlock);

      const result = await RpcClient.getBlock(12345, true);

      expect(result).toEqual(mockBlock);
      expect(mockHttpProvider.getBlock).toHaveBeenCalledWith(12345, true);
    });

    it('should return null if block not found', async () => {
      mockHttpProvider.getBlock.mockResolvedValue(null);

      const result = await RpcClient.getBlock(999999999, true);

      expect(result).toBe(null);
    });

    it('should retry on failure and succeed', async () => {
      const mockBlock = { number: 12345, hash: '0xabc123', transactions: [], gasUsed: 21000n };

      mockHttpProvider.getBlock
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce(mockBlock);

      const result = await RpcClient.getBlock(12345, true);

      expect(result).toEqual(mockBlock);
      expect(mockHttpProvider.getBlock).toHaveBeenCalledTimes(3);
      expect(RpcClient.sleep).toHaveBeenCalledTimes(2);
    });

    it('should throw error after max retries', async () => {
      mockHttpProvider.getBlock.mockRejectedValue(new Error('Persistent error'));

      await expect(RpcClient.getBlock(12345, true)).rejects.toThrow('Persistent error');
      expect(mockHttpProvider.getBlock).toHaveBeenCalledTimes(3); // default retries
    });

    it('should use exponential backoff for retries', async () => {
      mockHttpProvider.getBlock.mockRejectedValue(new Error('Error'));

      try {
        await RpcClient.getBlock(12345, true);
      } catch (e) {
        // Expected to fail
      }

      expect(RpcClient.sleep).toHaveBeenNthCalledWith(1, 1000);  // 2^0 * 1000
      expect(RpcClient.sleep).toHaveBeenNthCalledWith(2, 2000);  // 2^1 * 1000
    });
  });

  describe('getBlockRange()', () => {
    beforeEach(() => {
      RpcClient.httpProvider = mockHttpProvider;
      jest.spyOn(RpcClient, 'getBlock');
    });

    it('should fetch sequential block range', async () => {
      const mockBlocks = [
        { number: 100, hash: '0xaaa', transactions: [], gasUsed: 21000n },
        { number: 101, hash: '0xbbb', transactions: [], gasUsed: 22000n },
        { number: 102, hash: '0xccc', transactions: [], gasUsed: 23000n },
      ];

      RpcClient.getBlock.mockImplementation((blockNum) =>
        Promise.resolve(mockBlocks[blockNum - 100])
      );

      const result = await RpcClient.getBlockRange(100, 102);

      expect(result).toHaveLength(3);
      expect(result[0].number).toBe(100);
      expect(result[2].number).toBe(102);
      expect(RpcClient.getBlock).toHaveBeenCalledTimes(3);
    });

    it('should throw error if any block fetch fails', async () => {
      RpcClient.getBlock
        .mockResolvedValueOnce({ number: 100 })
        .mockRejectedValueOnce(new Error('Block fetch failed'));

      await expect(RpcClient.getBlockRange(100, 102)).rejects.toThrow('Block fetch failed');
    });
  });

  describe('getBlocksParallel()', () => {
    beforeEach(() => {
      RpcClient.httpProvider = mockHttpProvider;
      jest.spyOn(RpcClient, 'getBlock');
    });

    it('should fetch blocks in parallel with concurrency limit', async () => {
      const blockNumbers = [100, 101, 102, 103, 104];

      RpcClient.getBlock.mockImplementation((blockNum) =>
        Promise.resolve({ number: blockNum, hash: `0x${blockNum}`, transactions: [], gasUsed: 21000n })
      );

      const result = await RpcClient.getBlocksParallel(blockNumbers, 2);

      expect(result).toHaveLength(5);
      expect(RpcClient.getBlock).toHaveBeenCalledTimes(5);
    });

    it('should filter out null blocks', async () => {
      const blockNumbers = [100, 101, 102];

      RpcClient.getBlock
        .mockResolvedValueOnce({ number: 100, hash: '0xaaa', transactions: [], gasUsed: 21000n })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ number: 102, hash: '0xccc', transactions: [], gasUsed: 23000n });

      const result = await RpcClient.getBlocksParallel(blockNumbers, 3);

      expect(result).toHaveLength(2);
      expect(result[0].number).toBe(100);
      expect(result[1].number).toBe(102);
    });

    it('should throw error if chunk fails', async () => {
      const blockNumbers = [100, 101, 102];

      RpcClient.getBlock.mockRejectedValue(new Error('Parallel fetch failed'));

      await expect(RpcClient.getBlocksParallel(blockNumbers, 2)).rejects.toThrow('Parallel fetch failed');
    });
  });

  describe('healthCheck()', () => {
    beforeEach(() => {
      RpcClient.httpProvider = mockHttpProvider;
    });

    it('should return true if RPC is healthy', async () => {
      mockHttpProvider.getBlockNumber.mockResolvedValue(12345);

      const result = await RpcClient.healthCheck();

      expect(result).toBe(true);
    });

    it('should return false if RPC is unhealthy', async () => {
      mockHttpProvider.getBlockNumber.mockRejectedValue(new Error('Connection failed'));

      const result = await RpcClient.healthCheck();

      expect(result).toBe(false);
    });
  });

  describe('close()', () => {
    it('should close WebSocket provider if exists', async () => {
      RpcClient.wsProvider = mockWsProvider;
      RpcClient.isConnected = true;

      await RpcClient.close();

      expect(mockWsProvider.destroy).toHaveBeenCalled();
      expect(RpcClient.isConnected).toBe(false);
    });

    it('should not error if no WebSocket provider', async () => {
      RpcClient.wsProvider = null;
      RpcClient.isConnected = true;

      await expect(RpcClient.close()).resolves.not.toThrow();
      expect(RpcClient.isConnected).toBe(false);
    });
  });

  describe('sleep()', () => {
    it('should resolve after specified milliseconds', async () => {
      jest.useFakeTimers();

      const sleepPromise = RpcClient.sleep(1000);
      jest.advanceTimersByTime(1000);

      await expect(sleepPromise).resolves.toBeUndefined();

      jest.useRealTimers();
    });
  });
});
