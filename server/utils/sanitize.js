/**
 * Sanitize a string for safe injection into generated JS/text files.
 * Strips characters that could break template syntax or inject code.
 */
function sanitizeToken(value) {
  if (typeof value !== 'string') return '';
  // Allow alphanumeric, spaces, common punctuation - no backticks, template literals, or control chars
  return value
    .replace(/[`\\${}]/g, '')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim()
    .slice(0, 500);
}

function sanitizeIdentifier(value) {
  if (typeof value !== 'string') return 'MyBot';
  return value.replace(/[^a-zA-Z0-9_\- ]/g, '').trim().slice(0, 30);
}

function slugify(value) {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'my-bot';
}

module.exports = { sanitizeToken, sanitizeIdentifier, slugify };
