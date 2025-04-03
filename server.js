// Import required modules
const cluster = require("cluster");
const os = require("os");
const app = require("./src/app");
const {
  initRedis,
  initPostgres,
  closeConnections,
  checkHealth,
} = require("./src/config/database");
const UrlService = require("./src/services/urlService");
require("dotenv").config();

// Configuration constants
const PORT = process.env.PORT || 3000;
const WORKERS = os.cpus().length;
// Only enable clustering in production mode when explicitly configured
const ENABLE_CLUSTER =
  process.env.ENABLE_CLUSTER === "true" &&
  process.env.NODE_ENV === "production";

// Determine if this is a master or worker process
const processType = cluster.isMaster ? "Master" : "Worker";

/**
 * Common initialization logic shared between master and worker processes
 * - Initializes PostgreSQL and Redis connections
 * - Sets up periodic health checks
 * - Configures graceful shutdown handlers
 */
const initializeCommon = async () => {
  try {
    // Initialize database connections
    await initPostgres();
    await initRedis().catch((err) => {
      console.warn(
        `${processType} ${process.pid}: Redis initialization failed, continuing without cache:`,
        err.message
      );
    });

    // Set up periodic health checks every 5 minutes
    setInterval(async () => {
      try {
        const health = await checkHealth();
        if (!health.postgres || !health.redis) {
          console.warn(
            `${processType} ${process.pid}: Database health check warning:`,
            health
          );
        }
      } catch (error) {
        console.error(
          `${processType} ${process.pid}: Health check error:`,
          error
        );
      }
    }, 5 * 60 * 1000);

    // Configure graceful shutdown handler
    const gracefulShutdown = async (signal) => {
      console.log(
        `Received ${signal}. ${processType} ${process.pid} shutting down gracefully...`
      );

      try {
        await closeConnections();
        console.log(
          `${processType} ${process.pid}: All connections closed successfully`
        );
        process.exit(0);
      } catch (error) {
        console.error(
          `${processType} ${process.pid}: Error during graceful shutdown:`,
          error
        );
        process.exit(1);
      }
    };

    // Register shutdown signal handlers
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));

    return { gracefulShutdown };
  } catch (error) {
    console.error(
      `${processType} ${process.pid}: Failed to initialize application:`,
      error
    );
    process.exit(1);
  }
};

/**
 * Sets up periodic job to cleanup expired URLs
 * Runs every hour to maintain database hygiene
 */
const setupCleanupJob = () => {
  console.log(`${processType} ${process.pid}: Setting up URL cleanup job`);

  return setInterval(async () => {
    try {
      const count = await UrlService.cleanupExpiredUrls();
      if (count > 0) {
        console.log(
          `${processType} ${process.pid}: Cleaned up ${count} expired URLs`
        );
      }
    } catch (error) {
      console.error(
        `${processType} ${process.pid}: Error during expired URL cleanup:`,
        error
      );
    }
  }, 60 * 60 * 1000);
};

/**
 * Initialize worker process
 * - Sets up HTTP server
 * - Configures custom graceful shutdown for server
 */
const initializeWorker = async () => {
  const { gracefulShutdown } = await initializeCommon();

  // Start HTTP server
  const server = app.listen(PORT, () => {
    console.log(
      `Worker ${process.pid}: URL Shortener service running on port ${PORT}`
    );
    console.log(`Base URL: ${process.env.BASE_URL}`);
  });

  // Configure custom graceful shutdown for worker
  const originalShutdown = gracefulShutdown;
  process.removeAllListeners("SIGTERM");
  process.removeAllListeners("SIGINT");

  const serverGracefulShutdown = async (signal) => {
    console.log(
      `Received ${signal}. Worker ${process.pid} shutting down gracefully...`
    );

    // Close HTTP server first, then proceed with common shutdown
    server.close(async () => {
      console.log(`Worker ${process.pid}: HTTP server closed`);
      await originalShutdown(signal);
    });

    // Force shutdown if graceful shutdown takes too long
    setTimeout(() => {
      console.error(`Worker ${process.pid}: Forced shutdown after timeout`);
      process.exit(1);
    }, 10000);
  };

  // Register worker-specific shutdown handlers
  process.on("SIGTERM", () => serverGracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => serverGracefulShutdown("SIGINT"));
};

/**
 * Initialize master process
 * - Handles cleanup tasks
 * - Doesn't run HTTP server
 */
const initializeMaster = async () => {
  console.log(`Master ${process.pid}: Initializing for cleanup tasks`);

  await initializeCommon();

  setupCleanupJob();
};

// Global error handlers
process.on("uncaughtException", (err) => {
  console.error(`${processType} ${process.pid}: Uncaught exception:`, err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error(
    `${processType} ${process.pid}: Unhandled Rejection at:`,
    promise,
    "reason:",
    reason
  );
  process.exit(1);
});

// Application startup logic
if (ENABLE_CLUSTER && cluster.isMaster) {
  // Master process in cluster mode
  console.log(`Master ${process.pid} is running`);

  initializeMaster();

  // Fork worker processes
  for (let i = 0; i < WORKERS; i++) {
    cluster.fork();
  }

  // Handle worker crashes by spawning new workers
  cluster.on("exit", (worker, code, signal) => {
    console.log(
      `Worker ${worker.process.pid} died with code: ${code} and signal: ${signal}`
    );
    console.log("Starting a new worker");
    cluster.fork();
  });
} else if (!ENABLE_CLUSTER) {
  // Single process mode - run both worker and cleanup tasks
  initializeWorker();
  setupCleanupJob();
} else {
  // Worker process in cluster mode - only handle HTTP requests
  initializeWorker();
}
