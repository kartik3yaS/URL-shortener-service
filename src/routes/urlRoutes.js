const express = require("express");
const UrlService = require("../services/urlService");
const rateLimit = require("express-rate-limit");
const { isValidUrl } = require("../utils/urlValidator");

const router = express.Router();

// Rate limiting middleware
const createUrlLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

const redirectLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 300,
  message: { error: "Too many redirect requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Shorten a URL with custom alias
router.post("/shorten", createUrlLimiter, async (req, res) => {
  const { longUrl, expiresIn } = req.body;
  const customAlias = req.query.alias || req.body.alias;

  if (!longUrl) {
    return res.status(400).json({ error: "Long URL is required" });
  }

  if (!isValidUrl(longUrl)) {
    return res.status(400).json({ error: "Invalid URL format" });
  }

  try {
    const creatorIp =
      req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    const result = await UrlService.shortenUrl(longUrl, {
      expiresIn: parseInt(expiresIn) || null,
      creatorIp,
      customAlias,
    });

    const shortCode = result.shortCode || result;
    const shortUrl = `${process.env.BASE_URL}/${shortCode}`;

    res.json({
      success: true,
      shortUrl,
      shortCode,
      longUrl,
      expiresIn: expiresIn ? parseInt(expiresIn) : null,
      customAlias: customAlias ? true : false,
    });
  } catch (error) {
    console.error("Error shortening URL:", error);

    if (error.message.includes("malicious")) {
      return res.status(403).json({ error: error.message });
    }

    if (error.message.includes("alias already exists")) {
      return res.status(409).json({
        error: "Custom alias already in use. Please choose another one.",
      });
    }

    if (error.message.includes("invalid alias")) {
      return res.status(400).json({
        error:
          "Invalid custom alias format. Use only alphanumeric characters, hyphens, and underscores.",
      });
    }

    if (error.message.includes("reserved alias")) {
      return res.status(400).json({
        error:
          "This alias is reserved and cannot be used. Please choose another one.",
      });
    }

    res.status(500).json({ error: "Internal server error" });
  }
});

// Redirect to the original URL
router.get("/:shortCode", redirectLimiter, async (req, res) => {
  const { shortCode } = req.params;

  if (!shortCode || typeof shortCode !== "string" || shortCode.length < 3) {
    return res.status(400).json({ error: "Invalid short code format" });
  }

  try {
    const longUrl = await UrlService.getLongUrl(shortCode);

    if (longUrl) {
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "no-referrer");

      return res.redirect(longUrl);
    } else {
      return res.status(404).json({ error: "Short URL not found or expired" });
    }
  } catch (error) {
    console.error("Error redirecting URL:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get URL statistics
router.get("/stats/:shortCode", async (req, res) => {
  const { shortCode } = req.params;

  if (!shortCode || shortCode.length < 3) {
    return res.status(400).json({ error: "Invalid short code format" });
  }

  try {
    const stats = await UrlService.getUrlStats(shortCode);

    if (stats) {
      return res.json({
        success: true,
        stats: {
          shortCode: stats.short_code,
          longUrl: stats.long_url,
          clicks: stats.clicks,
          createdAt: stats.created_at,
          expiresAt: stats.expires_at,
          lastAccessed: stats.last_accessed,
          isCustomAlias: stats.is_custom_alias || false,
        },
      });
    } else {
      return res.status(404).json({ error: "Short URL not found" });
    }
  } catch (error) {
    console.error("Error getting URL stats:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
