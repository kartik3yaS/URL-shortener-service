const { Pool } = require("pg");
const redis = require("redis");
const crypto = require("crypto");
require("dotenv").config();

const pgPool = new Pool({
  connectionString: process.env.POSTGRES_URI,
  ssl:
    process.env.NODE_ENV === "production" && process.env.USE_SSL === "true"
      ? { rejectUnauthorized: false }
      : false,
  max: 20,
  idleTimeoutMillis: 30000,
});

// Create Redis client
const redisClient = redis.createClient({
  url: process.env.REDIS_URI,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 1000),
  },
});

/**
 * Initialize Redis connection
 * @returns {Promise<boolean>}
 */
const initRedis = async () => {
  try {
    await redisClient.connect();
    console.log("Redis client connected");

    redisClient.on("error", (err) => {
      console.error("Redis error:", err);
    });

    redisClient.on("reconnecting", () => {
      console.log("Redis client reconnecting");
    });

    return true;
  } catch (err) {
    console.error("Redis connection error:", err);
    console.log("Continuing without Redis cache");
    return false;
  }
};

/**
 * Initialize PostgreSQL connection and set up schema
 * @returns {Promise<boolean>}
 */
const initPostgres = async () => {
  try {
    await pgPool.query("SELECT NOW()");
    console.log("PostgreSQL connected");

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS urls (
        id SERIAL PRIMARY KEY,
        long_url TEXT NOT NULL,
        short_code VARCHAR(30) UNIQUE NOT NULL,
        clicks INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE,
        creator_ip VARCHAR(45),
        last_accessed TIMESTAMP,
        is_custom_alias BOOLEAN DEFAULT FALSE
      )
    `);

    // Create indexes for faster lookups
    await pgPool.query(`
      CREATE INDEX IF NOT EXISTS idx_short_code ON urls(short_code);
      CREATE INDEX IF NOT EXISTS idx_long_url ON urls(long_url);
      CREATE INDEX IF NOT EXISTS idx_creator_ip ON urls(creator_ip);
      CREATE INDEX IF NOT EXISTS idx_is_active ON urls(is_active);
      CREATE INDEX IF NOT EXISTS idx_expires_at ON urls(expires_at);
    `);

    console.log("URLs table initialized");
    return true;
  } catch (err) {
    console.error("PostgreSQL connection error:", err);
    process.exit(1);
  }
};

/**
 * Close database connections
 * @returns {Promise<boolean>}
 */
const closeConnections = async () => {
  try {
    await pgPool.end();
    console.log("PostgreSQL connection closed");

    if (redisClient.isReady) {
      await redisClient.quit();
      console.log("Redis connection closed");
    }

    return true;
  } catch (error) {
    console.error("Error closing database connections:", error);
    throw error;
  }
};

/**
 * Generate a secure short code
 * @param {number} length - Length of the short code
 * @returns {string} Generated short code
 */
const generateSecureShortCode = (length = 7) => {
  const bytes = crypto.randomBytes(Math.ceil((length * 3) / 4));
  return bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "")
    .substring(0, length);
};

/**
 * Check if a database connection is healthy
 * @returns {Promise<Object>}
 */
const checkHealth = async () => {
  const health = {
    postgres: false,
    redis: false,
    timestamp: new Date().toISOString(),
  };

  try {
    await pgPool.query("SELECT 1");
    health.postgres = true;
  } catch (error) {
    console.error("PostgreSQL health check failed:", error.message);
  }

  try {
    if (redisClient.isReady) {
      await redisClient.ping();
      health.redis = true;
    }
  } catch (error) {
    console.error("Redis health check failed:", error.message);
  }

  return health;
};

module.exports = {
  pgPool,
  redisClient,
  initRedis,
  initPostgres,
  closeConnections,
  generateSecureShortCode,
  checkHealth,
};
