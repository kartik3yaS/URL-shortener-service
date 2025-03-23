const { pgPool } = require("../config/database");

class Url {
  static async create(longUrl, shortCode, options = {}) {
    const { expiresAt, creatorIp, isCustomAlias } = options;

    try {
      const query = `
        INSERT INTO urls 
          (long_url, short_code, clicks, expires_at, creator_ip, is_custom_alias) 
        VALUES ($1, $2, $3, $4, $5, $6) 
        RETURNING *
      `;

      const values = [
        longUrl,
        shortCode,
        0,
        expiresAt || null,
        creatorIp || null,
        isCustomAlias || false,
      ];

      const { rows } = await pgPool.query(query, values);
      return rows[0];
    } catch (error) {
      if (error.code === "23505") {
        throw new Error("alias already exists");
      }
      throw error;
    }
  }

  static async findByLongUrl(longUrl) {
    const query =
      "SELECT * FROM urls WHERE long_url = $1 AND (expires_at IS NULL OR expires_at > NOW()) AND is_active = TRUE";
    const { rows } = await pgPool.query(query, [longUrl]);
    return rows[0];
  }

  static async findByShortCode(shortCode) {
    const query = "SELECT * FROM urls WHERE short_code = $1";
    const { rows } = await pgPool.query(query, [shortCode]);
    return rows[0];
  }

  static async incrementClicks(shortCode) {
    const query = `
      UPDATE urls 
      SET 
        clicks = clicks + 1,
        last_accessed = NOW()
      WHERE short_code = $1 AND is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW())
      RETURNING *
    `;

    const { rows } = await pgPool.query(query, [shortCode]);
    return rows[0];
  }

  static async getStats(shortCode) {
    const query = `
      SELECT 
        short_code, 
        long_url, 
        clicks, 
        created_at, 
        expires_at,
        last_accessed,
        is_custom_alias
      FROM urls 
      WHERE short_code = $1
    `;

    const { rows } = await pgPool.query(query, [shortCode]);
    return rows[0];
  }

  static async deactivateExpiredUrls() {
    const query = `
      UPDATE urls 
      SET is_active = FALSE 
      WHERE expires_at < NOW() AND is_active = TRUE
      RETURNING short_code
    `;

    const { rows } = await pgPool.query(query);
    return rows;
  }

  static async isUrlMalicious(longUrl) {
    const maliciousPatterns = [/phish/i, /malware/i, /hack/i, /scam/i];

    return maliciousPatterns.some((pattern) => pattern.test(longUrl));
  }

  static async getCustomAliasCount(creatorIp) {
    const query = `
      SELECT COUNT(*) as count
      FROM urls
      WHERE creator_ip = $1 AND is_custom_alias = TRUE
      AND created_at > NOW() - INTERVAL '24 hours'
    `;

    const { rows } = await pgPool.query(query, [creatorIp]);
    return parseInt(rows[0].count);
  }

  static async deleteExpiredUrls(olderThan = "30 days") {
    const query = `
      DELETE FROM urls
      WHERE 
        (expires_at IS NOT NULL AND expires_at < NOW() - INTERVAL $1)
        OR
        (is_active = FALSE AND created_at < NOW() - INTERVAL $1)
      RETURNING short_code
    `;

    const { rows } = await pgPool.query(query, [olderThan]);
    return rows;
  }
}

module.exports = Url;
