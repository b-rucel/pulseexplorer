require('dotenv').config();

/**
 * Centralized Configuration Module
 *
 * Single source of truth for all application configuration.
 * Loads environment variables, provides defaults, and validates required values.
 *
 * Usage:
 *   const config = require('./lib/config');
 *   console.log(config.db.host);
 *   console.log(config.indexer.batchSize);
 */

class Config {
  constructor() {
    this.load();
    this.validate();
  }

  load() {
    // Environment
    this.env = process.env.NODE_ENV || 'development';
    this.isDevelopment = this.env === 'development';
    this.isProduction = this.env === 'production';
    this.isTest = this.env === 'test';

    // Database Configuration
    this.db = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'pulsechain_explorer',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      // Connection pool settings
      max: parseInt(process.env.DB_MAX_CONNECTIONS || '20'),
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '2000'),
    };

    // RPC Configuration
    this.rpc = {
      http: process.env.RPC_URL || 'https://rpc.pulsechain.com',
      ws: process.env.RPC_WS_URL || 'wss://rpc.pulsechain.com',
      timeout: parseInt(process.env.RPC_TIMEOUT || '30000'),
      retries: parseInt(process.env.RPC_RETRIES || '3'),
    };

    // Indexer Configuration
    this.indexer = {
      startBlock: parseInt(process.env.INDEXER_START_BLOCK || '0'),
      batchSize: parseInt(process.env.INDEXER_BATCH_SIZE || '50'),
      parallelBatches: parseInt(process.env.INDEXER_PARALLEL_BATCHES || '5'),
      blockDelay: parseInt(process.env.INDEXER_BLOCK_DELAY || '0'),
      enableReorgCheck: process.env.INDEXER_ENABLE_REORG_CHECK !== 'false',
    };

    // API Configuration (for future use)
    this.api = {
      port: parseInt(process.env.PORT || '3000'),
      host: process.env.API_HOST || '0.0.0.0',
      corsOrigin: process.env.CORS_ORIGIN || '*',
    };

    // Redis Configuration (for future use)
    this.redis = {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      ttl: {
        latestBlocks: parseInt(process.env.CACHE_TTL_LATEST_BLOCKS || '12'),
        finalizedBlocks: parseInt(process.env.CACHE_TTL_FINALIZED_BLOCKS || '3600'),
        addresses: parseInt(process.env.CACHE_TTL_ADDRESSES || '30'),
      },
    };

    // Logging Configuration
    this.logging = {
      level: process.env.LOG_LEVEL || 'info',
    };
  }

  validate() {
    const errors = [];

    // Required fields (only in non-test environments)
    if (!this.isTest) {
      if (!this.db.password) {
        errors.push('DB_PASSWORD is required');
      }
    }

    // Validate port numbers
    if (this.db.port < 1 || this.db.port > 65535) {
      errors.push('DB_PORT must be between 1 and 65535');
    }

    if (this.api.port < 1 || this.api.port > 65535) {
      errors.push('PORT must be between 1 and 65535');
    }

    // Validate RPC URL format
    if (this.rpc.http && !this.rpc.http.startsWith('http')) {
      errors.push('RPC_URL must start with http:// or https://');
    }

    if (this.rpc.ws && !this.rpc.ws.startsWith('ws')) {
      errors.push('RPC_WS_URL must start with ws:// or wss://');
    }

    // Validate positive integers
    if (this.indexer.batchSize < 1) {
      errors.push('INDEXER_BATCH_SIZE must be at least 1');
    }

    if (this.indexer.parallelBatches < 1) {
      errors.push('INDEXER_PARALLEL_BATCHES must be at least 1');
    }

    if (this.rpc.retries < 0) {
      errors.push('RPC_RETRIES must be at least 0');
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n  - ${errors.join('\n  - ')}`);
    }
  }

  /**
   * Get full configuration object
   */
  getAll() {
    return {
      env: this.env,
      db: this.db,
      rpc: this.rpc,
      indexer: this.indexer,
      api: this.api,
      redis: this.redis,
      logging: this.logging,
    };
  }

  /**
   * Print configuration (masks sensitive data)
   */
  print() {
    const safe = {
      env: this.env,
      db: {
        ...this.db,
        password: this.db.password ? '***' : undefined,
      },
      rpc: this.rpc,
      indexer: this.indexer,
      api: this.api,
      redis: {
        ...this.redis,
        url: this.redis.url.replace(/:([^:@]+)@/, ':***@'), // Mask password in URL
      },
      logging: this.logging,
    };

    return JSON.stringify(safe, null, 2);
  }

  /**
   * Get display-safe configuration for logging
   */
  getDisplayConfig() {
    return {
      database: `${this.db.host}:${this.db.port}/${this.db.database}`,
      rpcUrl: this.rpc.http,
      startBlock: this.indexer.startBlock,
      batchSize: this.indexer.batchSize,
      parallelBatches: this.indexer.parallelBatches,
      environment: this.env,
    };
  }
}

// Export singleton instance
module.exports = new Config();
