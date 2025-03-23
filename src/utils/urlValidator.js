function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (err) {
    return false;
  }
}

function sanitizeUrl(url) {
  let sanitized = url.trim();

  if (!sanitized.startsWith("http://") && !sanitized.startsWith("https://")) {
    sanitized = "https://" + sanitized;
  }

  return sanitized;
}

module.exports = { isValidUrl, sanitizeUrl };
