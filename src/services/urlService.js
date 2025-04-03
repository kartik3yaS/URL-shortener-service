const Url = require("../models/Url");
const { redisClient, generateSecureShortCode } = require("../config/database");
const { isValidUrl, sanitizeUrl } = require("../utils/urlValidator");

class UrlService {
  static async shortenUrl(longUrl, options = {}) {
    try {
      if (!isValidUrl(longUrl)) {
        throw new Error("Invalid URL format");
      }

      const sanitizedUrl = sanitizeUrl(longUrl);

      const isMalicious = await Url.isUrlMalicious(sanitizedUrl);
      if (isMalicious) {
        throw new Error("URL has been flagged as potentially malicious");
      }

      const { expiresIn, creatorIp, customAlias } = options;

      if (customAlias) {
        if (!this.isValidAlias(customAlias)) {
          throw new Error("invalid alias format");
        }

        if (this.isReservedAlias(customAlias)) {
          throw new Error("reserved alias");
        }

        const existingAlias = await Url.findByShortCode(customAlias);
        if (existingAlias) {
          throw new Error("alias already exists");
        }

        let expiresAt = null;
        if (expiresIn) {
          expiresAt = new Date();
          expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);
        }

        await Url.create(sanitizedUrl, customAlias, {
          expiresAt,
          creatorIp,
          isCustomAlias: true,
        });

        // Cache the mapping if Redis is available
        try {
          if (redisClient.isReady) {
            await redisClient.set(customAlias, sanitizedUrl, {
              EX: expiresIn || 3600,
            });
          }
        } catch (redisError) {
          console.error("Redis caching error:", redisError);
        }

        return { shortCode: customAlias, isCustomAlias: true };
      }

      const existingUrl = await Url.findByLongUrl(sanitizedUrl);
      if (existingUrl) {
        return { shortCode: existingUrl.short_code, isCustomAlias: false };
      }

      const shortCode = await generateSecureShortCode();

      let expiresAt = null;
      if (expiresIn) {
        expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);
      }

      const url = await Url.create(sanitizedUrl, shortCode, {
        expiresAt,
        creatorIp,
        isCustomAlias: false,
      });

      try {
        if (redisClient.isReady) {
          await redisClient.set(shortCode, sanitizedUrl, {
            EX: expiresIn || 3600,
          });
        }
      } catch (redisError) {
        console.error("Redis caching error:", redisError);
      }

      return { shortCode, isCustomAlias: false };
    } catch (error) {
      console.error("Error in shortenUrl service:", error);
      throw error;
    }
  }

  static isValidAlias(alias) {
    const aliasRegex = /^[a-zA-Z0-9_-]{3,30}$/;
    return aliasRegex.test(alias);
  }

  static isReservedAlias(alias) {
    const reservedWords = [
      "api",
      "admin",
      "shorten",
      "stats",
      "health",
      "login",
      "register",
      "dashboard",
      "settings",
      "help",
      "about",
    ];
    return reservedWords.includes(alias.toLowerCase());
  }

  static async getLongUrl(shortCode) {
    try {
      if (!shortCode || typeof shortCode !== "string" || shortCode.length < 3) {
        throw new Error("Invalid short code");
      }

      // Try to get from cache first if Redis is available
      let cachedUrl = null;
      try {
        if (redisClient.isReady) {
          cachedUrl = await redisClient.get(shortCode);
        }
      } catch (redisError) {
        console.error("Redis error:", redisError);
      }

      if (cachedUrl) {
        Url.incrementClicks(shortCode).catch((err) =>
          console.error("Error incrementing clicks:", err)
        );
        return cachedUrl;
      }

      // If not in cache, get from database
      const url = await Url.findByShortCode(shortCode);
      if (!url) {
        return null;
      }

      if (url.expires_at && new Date(url.expires_at) < new Date()) {
        return null;
      }

      if (!url.is_active) {
        return null;
      }

      // Cache the result for future requests if Redis is available
      try {
        if (redisClient.isReady) {
          const expirySeconds = url.expires_at
            ? Math.floor((new Date(url.expires_at) - new Date()) / 1000)
            : 3600;

          if (expirySeconds > 0) {
            await redisClient.set(shortCode, url.long_url, {
              EX: expirySeconds,
            });
          }
        }
      } catch (redisError) {
        console.error("Redis caching error:", redisError);
      }

      await Url.incrementClicks(shortCode);
      return url.long_url;
    } catch (error) {
      console.error("Error in getLongUrl service:", error);
      throw error;
    }
  }

  static async getUrlStats(shortCode) {
    try {
      if (!shortCode || typeof shortCode !== "string") {
        throw new Error("Invalid short code");
      }

      const stats = await Url.getStats(shortCode);
      return stats;
    } catch (error) {
      console.error("Error in getUrlStats service:", error);
      throw error;
    }
  }

  static async cleanupExpiredUrls() {
    try {
      const expiredUrls = await Url.deactivateExpiredUrls();

      // Remove expired URLs from Redis cache
      if (redisClient.isReady && expiredUrls.length > 0) {
        for (const url of expiredUrls) {
          await redisClient.del(url.short_code);
        }
      }

      return expiredUrls.length;
    } catch (error) {
      console.error("Error cleaning up expired URLs:", error);
      throw error;
    }
  }
}

module.exports = UrlService;
