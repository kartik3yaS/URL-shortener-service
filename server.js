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

const PORT = process.env.PORT || 3000;
const WORKERS = process.env.WEB_CONCURRENCY || os.cpus().length;
const ENABLE_CLUSTER =
  process.env.ENABLE_CLUSTER === "true" &&
  process.env.NODE_ENV === "production";

const processType = cluster.isMaster ? "Master" : "Worker";

// Common initialization for both master and worker processes
const initializeCommon = async () => {
  try {
    await initPostgres();
    await initRedis().catch((err) => {
      console.warn(
        `${processType} ${process.pid}: Redis initialization failed, continuing without cache:`,
        err.message
      );
    });

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

// Cleanup expired urls
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

// Worker
const initializeWorker = async () => {
  const { gracefulShutdown } = await initializeCommon();

  // Server start
  const server = app.listen(PORT, () => {
    console.log(
      `Worker ${process.pid}: URL Shortener service running on port ${PORT}`
    );
    console.log(`Base URL: ${process.env.BASE_URL}`);
  });

  const originalShutdown = gracefulShutdown;
  process.removeAllListeners("SIGTERM");
  process.removeAllListeners("SIGINT");

  const serverGracefulShutdown = async (signal) => {
    console.log(
      `Received ${signal}. Worker ${process.pid} shutting down gracefully...`
    );

    server.close(async () => {
      console.log(`Worker ${process.pid}: HTTP server closed`);
      await originalShutdown(signal);
    });

    setTimeout(() => {
      console.error(`Worker ${process.pid}: Forced shutdown after timeout`);
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", () => serverGracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => serverGracefulShutdown("SIGINT"));
};

// Master
const initializeMaster = async () => {
  console.log(`Master ${process.pid}: Initializing for cleanup tasks`);

  await initializeCommon();

  setupCleanupJob();
};

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

if (ENABLE_CLUSTER && cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);

  initializeMaster();

  for (let i = 0; i < WORKERS; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    console.log(
      `Worker ${worker.process.pid} died with code: ${code} and signal: ${signal}`
    );
    console.log("Starting a new worker");
    cluster.fork();
  });
} else if (!ENABLE_CLUSTER) {
  // Single process mode
  initializeWorker();
  setupCleanupJob();
} else {
  // Worker process in cluster mode
  initializeWorker();
}
