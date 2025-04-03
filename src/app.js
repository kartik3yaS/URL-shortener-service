const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const urlRoutes = require("./routes/urlRoutes");

// Initialize express app
const app = express();

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? [process.env.ALLOWED_ORIGIN]
        : "*",
  })
);

// Request parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`
    );
  });
  next();
};
app.use(requestLogger);

// Health check endpoint
const healthCheck = (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
};
app.get("/health", healthCheck);

// Main routes
app.use("/", urlRoutes);

// 404 handler
const notFoundHandler = (req, res) => {
  res.status(404).json({ error: "Not found" });
};
app.use(notFoundHandler);

// Global error handler
const errorHandler = (err, req, res, next) => {
  console.error(err.stack);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
  });
};
app.use(errorHandler);

module.exports = app;
