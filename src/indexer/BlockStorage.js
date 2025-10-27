const db = require('../../lib/db');
const logger = require('../../lib/logger');

/**
 * BlockStorage - Handles saving blocks to PostgreSQL database
 *
 * Responsibilities:
 * - Transform ethers.js block format to PostgreSQL format
 * - Save single blocks
 * - Save multiple blocks in batches
 * - Handle data type conversions (BigInt to string, hex to Buffer)
 * - Ensure data integrity with transactions
 */
class BlockStorage {
  /**
   * Transform ethers.js block to database format
   * @param {object} block - Block object from ethers.js
   * @returns {object} - Database-ready block data
   */
  transformBlock(block) {
    try {
      // Convert hex strings to Buffer (BYTEA in PostgreSQL)
      const hash = Buffer.from(block.hash.slice(2), 'hex');
      const parentHash = Buffer.from(block.parentHash.slice(2), 'hex');
      const miner = Buffer.from(block.miner.slice(2), 'hex');

      // Handle optional fields
      const extraData = block.extraData
        ? Buffer.from(block.extraData.slice(2), 'hex')
        : null;

      const baseFeePerGas = block.baseFeePerGas
        ? block.baseFeePerGas.toString()
        : null;

      // Merkle roots
      const transactionsRoot = block.transactionsRoot
        ? Buffer.from(block.transactionsRoot.slice(2), 'hex')
        : Buffer.from('0'.repeat(64), 'hex');

      const stateRoot = block.stateRoot
        ? Buffer.from(block.stateRoot.slice(2), 'hex')
        : Buffer.from('0'.repeat(64), 'hex');

      const receiptsRoot = block.receiptsRoot
        ? Buffer.from(block.receiptsRoot.slice(2), 'hex')
        : Buffer.from('0'.repeat(64), 'hex');

      const blockData = {
        hash,
        parent_hash: parentHash,
        number: block.number.toString(),
        timestamp: new Date(block.timestamp * 1000),
        nonce: block.nonce || '0',
        difficulty: block.difficulty?.toString() || '0',
        gas_limit: block.gasLimit.toString(),
        gas_used: block.gasUsed.toString(),
        miner,
        extra_data: extraData,
        base_fee_per_gas: baseFeePerGas,
        transactions_root: transactionsRoot,
        state_root: stateRoot,
        receipts_root: receiptsRoot,
        size: block.length || 0,
        transaction_count: block.transactions.length,
      };

      logger.debug('Block transformed', {
        number: block.number,
        hash: block.hash,
        txCount: block.transactions.length,
      });

      return blockData;
    } catch (error) {
      logger.error('Failed to transform block', {
        blockNumber: block.number,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Save a single block to database
   * @param {object} block - Block object from ethers.js
   * @returns {Promise<boolean>}
   */
  async saveBlock(block) {
    try {
      logger.debug('Saving block to database', {
        number: block.number,
        hash: block.hash,
      });

      const blockData = this.transformBlock(block);

      await db.insert('blocks', blockData, 'ON CONFLICT (hash) DO NOTHING');

      logger.info('Block saved', {
        number: block.number,
        hash: block.hash,
        transactions: block.transactions.length,
      });

      return true;
    } catch (error) {
      logger.error('Failed to save block', {
        blockNumber: block.number,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Save multiple blocks in a batch (uses transaction for atomicity)
   * @param {Array<object>} blocks - Array of block objects from ethers.js
   * @returns {Promise<number>} - Number of blocks saved
   */
  async saveBlocks(blocks) {
    if (!blocks || blocks.length === 0) {
      logger.warn('No blocks to save');
      return 0;
    }

    try {
      logger.info('Saving batch of blocks', {
        count: blocks.length,
        range: `${blocks[0].number} - ${blocks[blocks.length - 1].number}`,
      });

      const startTime = Date.now();
      let savedCount = 0;

      // Use transaction for atomicity
      await db.transaction(async (client) => {
        for (const block of blocks) {
          const blockData = this.transformBlock(block);

          // Build insert query
          const keys = Object.keys(blockData);
          const values = Object.values(blockData);
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

          const query = `
            INSERT INTO blocks (${keys.join(', ')})
            VALUES (${placeholders})
            ON CONFLICT (hash) DO NOTHING
          `;

          const result = await client.query(query, values);

          // Count if row was actually inserted (not skipped by conflict)
          if (result.rowCount > 0) {
            savedCount++;
          }
        }
      });

      const duration = Date.now() - startTime;
      const avgTime = duration / blocks.length;

      logger.info('Batch save completed', {
        total: blocks.length,
        saved: savedCount,
        skipped: blocks.length - savedCount,
        duration: `${duration}ms`,
        avgPerBlock: `${avgTime.toFixed(2)}ms`,
      });

      return savedCount;
    } catch (error) {
      logger.error('Failed to save block batch', {
        blockCount: blocks.length,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Check if a block exists in database
   * @param {number} blockNumber
   * @returns {Promise<boolean>}
   */
  async blockExists(blockNumber) {
    try {
      const result = await db.query(
        'SELECT 1 FROM blocks WHERE number = $1 LIMIT 1',
        [blockNumber.toString()]
      );

      return result.rows.length > 0;
    } catch (error) {
      logger.error('Failed to check block existence', {
        blockNumber,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get block from database by number
   * @param {number} blockNumber
   * @returns {Promise<object|null>}
   */
  async getBlock(blockNumber) {
    try {
      const result = await db.query(
        'SELECT * FROM blocks WHERE number = $1',
        [blockNumber.toString()]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to get block from database', {
        blockNumber,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get the last indexed block number
   * @returns {Promise<number|null>}
   */
  async getLastBlockNumber() {
    try {
      const result = await db.query(
        'SELECT number FROM blocks ORDER BY number DESC LIMIT 1'
      );

      if (result.rows.length === 0) {
        return null;
      }

      return parseInt(result.rows[0].number);
    } catch (error) {
      logger.error('Failed to get last block number', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get total block count in database
   * @returns {Promise<number>}
   */
  async getBlockCount() {
    try {
      const result = await db.query('SELECT COUNT(*) FROM blocks');
      return parseInt(result.rows[0].count);
    } catch (error) {
      logger.error('Failed to get block count', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Delete blocks from a certain number onwards (for reorg handling)
   * @param {number} fromBlock
   * @returns {Promise<number>} - Number of blocks deleted
   */
  async deleteBlocksFrom(fromBlock) {
    try {
      logger.warn('Deleting blocks due to reorg', {
        fromBlock,
      });

      const result = await db.query(
        'DELETE FROM blocks WHERE number >= $1',
        [fromBlock.toString()]
      );

      const deletedCount = result.rowCount;

      logger.info('Blocks deleted', {
        fromBlock,
        count: deletedCount,
      });

      return deletedCount;
    } catch (error) {
      logger.error('Failed to delete blocks', {
        fromBlock,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get database statistics
   * @returns {Promise<object>}
   */
  async getStats() {
    try {
      const result = await db.query(`
        SELECT
          COUNT(*) as total_blocks,
          MIN(number::bigint) as first_block,
          MAX(number::bigint) as last_block,
          SUM(transaction_count) as total_transactions,
          AVG(transaction_count) as avg_tx_per_block,
          SUM(gas_used::numeric) as total_gas_used,
          AVG(gas_used::numeric) as avg_gas_per_block
        FROM blocks
      `);

      const stats = result.rows[0];

      return {
        totalBlocks: parseInt(stats.total_blocks),
        firstBlock: stats.first_block ? parseInt(stats.first_block) : null,
        lastBlock: stats.last_block ? parseInt(stats.last_block) : null,
        totalTransactions: parseInt(stats.total_transactions || 0),
        avgTxPerBlock: parseFloat(stats.avg_tx_per_block || 0).toFixed(2),
        totalGasUsed: stats.total_gas_used?.toString() || '0',
        avgGasPerBlock: stats.avg_gas_per_block?.toString() || '0',
      };
    } catch (error) {
      logger.error('Failed to get stats', {
        error: error.message,
      });
      throw error;
    }
  }
}

module.exports = new BlockStorage();
