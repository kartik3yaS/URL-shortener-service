const crypto = require("crypto");

/**
 * Generates a secure short code
 * @param {number} length - Length of the short code
 * @returns {string} - Generated secure short code
 */
function generateSecureShortCode(length = 10) {
  const bytes = crypto.randomBytes(Math.ceil((length * 3) / 4));
  const base64 = bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return base64.substring(0, length);
}

module.exports = {
  generateSecureShortCode,
};
