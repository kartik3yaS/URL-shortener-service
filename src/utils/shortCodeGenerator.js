const crypto = require("crypto");
const Url = require("../models/Url");

/**
 * Generates a secure short code and ensures uniqueness by checking the database
 * @param {number} length - Length of the short code
 * @returns {Promise<string>} - Generated secure short code
 */
async function generateSecureShortCode(length = 10) {
  let shortCode;
  let isUnique = false;

  while (!isUnique) {
    const bytes = crypto.randomBytes(Math.ceil((length * 3) / 4));
    const base64 = bytes
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

    shortCode = base64.substring(0, length);

    const existingUrl = await Url.findByShortCode(shortCode);
    if (!existingUrl) {
      isUnique = true;
    }
  }

  return shortCode;
}

module.exports = {
  generateSecureShortCode,
};
