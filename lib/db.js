require('dotenv').config()
const logger = require('./logger');
const { Pool } = require('pg');

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: 'postgres', // set this to postgres, since setup might need to create the db
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
};


class Database {
  constructor() {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      max: config.maxConnections,
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
      database: config.database,
      max: config.maxConnections,
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
   * close all connections
   * @returns {Promise<void>}
   */
  async close() {
    await this.pool.end();
    logger.info('Database connection pool closed');
  }
}

// export singleton instance
module.exports = new Database();
