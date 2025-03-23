const crypto = require("crypto");
const { customAlphabet } = require("nanoid");

const SAFE_ALPHABET =
  "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const nanoid = customAlphabet(SAFE_ALPHABET, 7);

/**
 * Generates a random short code using nanoid
 * @param {number} length - Length of the short code (default: 7)
 * @returns {string} - Generated short code
 */
function generateShortCode(length = 7) {
  return nanoid(length);
}

/**
 * @param {string} longUrl - The original URL to shorten
 * @param {number} length - Length of the short code
 * @returns {string} - Generated short code
 */
function generateConsistentShortCode(longUrl, length = 7) {
  const hash = crypto.createHash("md5").update(longUrl).digest("hex");

  let shortCode = "";
  const base = SAFE_ALPHABET.length;

  const decimal = parseInt(hash.substring(0, 10), 16);

  let value = decimal;
  while (shortCode.length < length && value > 0) {
    shortCode = SAFE_ALPHABET.charAt(value % base) + shortCode;
    value = Math.floor(value / base);
  }

  while (shortCode.length < length) {
    shortCode =
      SAFE_ALPHABET.charAt(Math.floor(Math.random() * base)) + shortCode;
  }

  return shortCode.substring(0, length);
}

/**
 * Validates if a string is a valid short code
 * @param {string} code - The code to validate
 * @returns {boolean} - True if valid, false otherwise
 */
function isValidShortCode(code) {
  if (!code || typeof code !== "string") return false;

  const validChars = new RegExp(`^[${SAFE_ALPHABET}]+$`);
  return validChars.test(code) && code.length >= 4 && code.length <= 10;
}

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
  generateShortCode,
  generateConsistentShortCode,
  isValidShortCode,
  generateSecureShortCode,
  SAFE_ALPHABET,
};
