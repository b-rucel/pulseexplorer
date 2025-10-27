require('dotenv').config()
const logger = require('./logger');
const { Pool } = require('pg');

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'pulsechain_explorer',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
};


class Database {
  constructor(databaseName = null) {
    const dbName = databaseName || config.database;

    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: dbName,
      user: config.user,
      password: config.password,
      max: config.max,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })

    // Environment
    this.env = process.env.NODE_ENV || 'development';
    this.isDevelopment = this.env === 'development';
    this.isProduction = this.env === 'production';
    this.isTest = this.env === 'test';

    // Handle pool errors
    this.pool.on('error', (err) => {
      logger.error('Unexpected error on idle PostgreSQL client', { error: err.message });
    });

    // Log pool events in development
    if (this.isDevelopment) {
      this.pool.on('connect', () => {
        logger.debug('New client connected to PostgreSQL pool');
      });

      this.pool.on('remove', () => {
        logger.debug('Client removed from PostgreSQL pool');
      });
    }

    logger.info('Database connection pool initialized', {
      host: config.host,
      database: dbName,
      max: config.max,
    });
  }

  /**
   * execute a query
   * @param {string} text - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<object>} Query result
   */
  async query(text, params) {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;

      if (duration > 1000) {
        logger.warn('Slow query detected', {
          duration: `${duration}ms`,
          query: text.substring(0, 100),
          rows: result.rowCount
        });
      }

      if (config.isDevelopment && duration > 100) {
        logger.debug('Query executed', {
          duration: `${duration}ms`,
          rows: result.rowCount
        });
      }

      return result;
    } catch (error) {
      logger.error('Database query error', {
        error: error.message,
        query: text.substring(0, 100),
        params: params ? params.length : 0,
      });
      throw error;
    }
  }

  /**
   * Get a client from the pool for transactions
   * @returns {Promise<PoolClient>}
   */
  async getClient() {
    return await this.pool.connect();
  }

  /**
   * Execute queries within a transaction
   * @param {Function} callback - Async function to execute queries
   * @returns {Promise<any>} Result from callback
   */
  async transaction(callback) {
    const client = await this.getClient();

    try {
      await client.query('BEGIN');
      logger.debug('Transaction started');

      const result = await callback(client);

      await client.query('COMMIT');
      logger.debug('Transaction committed');

      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Transaction rolled back', { error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Insert a single row
   * @param {string} table - Table name
   * @param {object} data - Data to insert
   * @param {string} onConflict - ON CONFLICT clause (optional)
   * @returns {Promise<object>} Inserted row
   */
  async insert(table, data, onConflict = '') {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

    const query = `
      INSERT INTO ${table} (${keys.join(', ')})
      VALUES (${placeholders})
      ${onConflict}
      RETURNING *
    `;

    const result = await this.query(query, values);
    return result.rows[0];
  }


  /**
   * Check database connection
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    try {
      await this.query('SELECT 1');
      return true;
    } catch (error) {
      logger.error('Database health check failed', { error: error.message });
      return false;
    }
  }

  /**
   * Get pool statistics
   * @returns {object} Pool stats
   */
  getStats() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }

  /**
   * close all connections
   * @returns {Promise<void>}
   */
  async close() {
    await this.pool.end();
    logger.info('Database connection pool closed');
  }
}

// export singleton instance for default use
const defaultDb = new Database();

// Also export the Database class for custom instances
module.exports = defaultDb;
module.exports.Database = Database;
