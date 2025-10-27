#!/usr/bin/env node

/**
 * Simple test script for RPC block fetching
 *
 * Usage:
 *   node test-rpc.js
 */
require('dotenv').config()
const rpcClient = require('../src/indexer/RpcClient');
const logger = require('../lib/logger');

async function main() {
  try {
    logger.info('='.repeat(60));
    logger.info('RPC Block Fetching Test');
    logger.info('='.repeat(60));

    // Step 1: Connect to RPC
    logger.info('Step 1: Connecting to PulseChain RPC...');
    await rpcClient.connect();
    logger.info('✓ Connected successfully\n');

    // Step 2: Get current block number
    logger.info('Step 2: Getting current block number...');
    const currentBlock = await rpcClient.getBlockNumber();
    logger.info(`✓ Current block: ${currentBlock}\n`);

    // Step 3: Fetch a single block
    logger.info('Step 3: Fetching a single recent block...');
    const testBlock = currentBlock - 10; // Use a block that's 10 blocks old
    const block = await rpcClient.getBlock(testBlock, true);

    if (block) {
      logger.info('✓ Block fetched:', {
        number: block.number,
        hash: block.hash,
        timestamp: new Date(block.timestamp * 1000).toISOString(),
        transactions: block.transactions.length,
        miner: block.miner,
        gasUsed: block.gasUsed.toString(),
        gasLimit: block.gasLimit.toString(),
      });
    }
    logger.info('');

    // Step 4: Fetch a range of blocks (sequential)
    logger.info('Step 4: Fetching range of 3 blocks (sequential)...');
    const blocks = await rpcClient.getBlockRange(testBlock, testBlock + 2);
    logger.info(`✓ Fetched ${blocks.length} blocks`);
    blocks.forEach(b => {
      logger.info(`  - Block ${b.number}: ${b.transactions.length} txs`);
    });
    logger.info('');

    // Step 5: Fetch blocks in parallel
    logger.info('Step 5: Fetching 5 blocks in parallel...');
    const blockNumbers = [testBlock, testBlock + 1, testBlock + 2, testBlock + 3, testBlock + 4];
    const parallelBlocks = await rpcClient.getBlocksParallel(blockNumbers, 5);
    logger.info(`✓ Fetched ${parallelBlocks.length} blocks in parallel\n`);

    // Step 6: Health check
    logger.info('Step 6: Running health check...');
    const isHealthy = await rpcClient.healthCheck();
    logger.info(`✓ RPC health status: ${isHealthy ? 'HEALTHY' : 'UNHEALTHY'}\n`);

    logger.info('='.repeat(60));
    logger.info('All tests passed! ✓');
    logger.info('='.repeat(60));

    await rpcClient.close();
    process.exit(0);
  } catch (error) {
    logger.error('Test failed', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

main();
