#!/usr/bin/env node

/**
 * Test script for BlockStorage - Save blocks to database
 *
 * Usage:
 *   node test-block-storage.js
 */
require('dotenv').config()
const rpcClient = require('../src/indexer/RpcClient');
const blockStorage = require('../src/indexer/BlockStorage');
const db = require('../lib/db');
const logger = require('../lib/logger');

async function main() {
  try {
    logger.info('='.repeat(60));
    logger.info('Block Storage Test');
    logger.info('='.repeat(60));

    // Step 1: Check database connection
    logger.info('Step 1: Checking database connection...');
    const isHealthy = await db.healthCheck();
    if (!isHealthy) {
      throw new Error('Database connection failed');
    }
    logger.info('✓ Database connected\n');

    // Step 2: Connect to RPC
    logger.info('Step 2: Connecting to PulseChain RPC...');
    await rpcClient.connect();
    logger.info('✓ RPC connected\n');

    // Step 3: Get current blockchain state
    logger.info('Step 3: Getting blockchain state...');
    const currentBlock = await rpcClient.getBlockNumber();
    const lastIndexed = await blockStorage.getLastBlockNumber();

    logger.info('Blockchain state:', {
      currentBlock,
      lastIndexed: lastIndexed || 'none',
      blocksInDB: await blockStorage.getBlockCount(),
    });
    logger.info('');

    // Step 4: Fetch a recent block
    logger.info('Step 4: Fetching a recent block from RPC...');
    const testBlockNumber = currentBlock - 10;

    const block = await rpcClient.getBlock(testBlockNumber, true);
    if (!block) {
      throw new Error('Failed to fetch block');
    }

    logger.info('✓ Block fetched:', {
      number: block.number,
      hash: block.hash,
      transactions: block.transactions.length,
    });
    logger.info('');

    // Step 5: Transform block to database format
    logger.info('Step 5: Transforming block to database format...');
    const transformedBlock = blockStorage.transformBlock(block);

    logger.info('✓ Block transformed:', {
      hash: transformedBlock.hash.length + ' bytes',
      number: transformedBlock.number,
      timestamp: transformedBlock.timestamp.toISOString(),
      gasUsed: transformedBlock.gas_used,
    });
    logger.info('');

    // Step 6: Save single block
    logger.info('Step 6: Saving single block to database...');
    await blockStorage.saveBlock(block);
    logger.info('✓ Block saved successfully\n');

    // Step 7: Verify block exists
    logger.info('Step 7: Verifying block exists in database...');
    const exists = await blockStorage.blockExists(testBlockNumber);
    logger.info(`✓ Block exists: ${exists}\n`);

    // Step 8: Fetch block from database
    logger.info('Step 8: Fetching block from database...');
    const dbBlock = await blockStorage.getBlock(testBlockNumber);

    if (dbBlock) {
      logger.info('✓ Block retrieved from database:', {
        number: dbBlock.number,
        hash: '0x' + dbBlock.hash.toString('hex'),
        timestamp: dbBlock.timestamp,
        txCount: dbBlock.transaction_count,
      });
    }
    logger.info('');

    // Step 9: Batch save multiple blocks
    logger.info('Step 9: Fetching and saving batch of blocks...');
    const batchStart = testBlockNumber + 1;
    const batchEnd = testBlockNumber + 3;

console.log(batchStart);
console.log(batchEnd)

    const blocks = await rpcClient.getBlockRange(batchStart, batchEnd);
console.log(blocks)

    logger.info(`✓ Fetched ${blocks.length} blocks from RPC`);

    const savedCount = await blockStorage.saveBlocks(blocks);
    logger.info(`✓ Saved ${savedCount} blocks to database\n`);

    // Step 10: Get database statistics
    logger.info('Step 10: Getting database statistics...');
    const stats = await blockStorage.getStats();

    logger.info('Database statistics:', {
      totalBlocks: stats.totalBlocks,
      blockRange: `${stats.firstBlock} - ${stats.lastBlock}`,
      totalTransactions: stats.totalTransactions,
      avgTxPerBlock: stats.avgTxPerBlock,
    });
    logger.info('');

    // Step 11: Test duplicate handling (ON CONFLICT)
    logger.info('Step 11: Testing duplicate block handling...');
    logger.info('Attempting to save same block again...');
    await blockStorage.saveBlock(block);
    logger.info('✓ Duplicate handled gracefully (ON CONFLICT DO NOTHING)\n');

    // Step 12: Test parallel fetch and save
    logger.info('Step 12: Testing parallel fetch and batch save...');
    const parallelStart = testBlockNumber + 4;
    const parallelBlocks = [parallelStart, parallelStart + 1, parallelStart + 2];

    const fetchedBlocks = await rpcClient.getBlocksParallel(parallelBlocks, 3);
    const parallelSaved = await blockStorage.saveBlocks(fetchedBlocks);
    logger.info(`✓ Parallel fetch and save completed: ${parallelSaved} blocks\n`);

    // Final statistics
    logger.info('='.repeat(60));
    logger.info('Final Database State:');
    logger.info('='.repeat(60));
    const finalStats = await blockStorage.getStats();
    logger.info(JSON.stringify(finalStats, null, 2));

    logger.info('='.repeat(60));
    logger.info('All tests passed! ✓');
    logger.info('='.repeat(60));

    await rpcClient.close();
    await db.close();
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
