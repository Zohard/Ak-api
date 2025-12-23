/**
 * Decode HTML numeric character references and named entities
 * Converts strings like "&#36196;&#26494;&#20581;" to actual characters
 */
export function decodeHTMLEntities(text: string | null | undefined): string | null | undefined {
  if (!text) {
    return text;
  }

  // Decode numeric character references (&#XXXX;)
  let decoded = text.replace(/&#(\d+);/g, (match, dec) => {
    return String.fromCharCode(dec);
  });

  // Decode hex character references (&#xXXXX;)
  decoded = decoded.replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });

  // Decode common named entities
  const namedEntities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&nbsp;': ' ',
  };

  Object.entries(namedEntities).forEach(([entity, char]) => {
    decoded = decoded.replace(new RegExp(entity, 'g'), char);
  });

  return decoded;
}

/**
 * Encode special characters to HTML entities
 */
export function encodeHTMLEntities(text: string | null | undefined): string | null | undefined {
  if (!text) {
    return text;
  }

  const entityMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  };

  return text.replace(/[&<>"']/g, (char) => entityMap[char] || char);
}

/**
 * Convert text to URL-friendly slug
 * Example: "The Legend of Zelda" -> "the-legend-of-zelda"
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}
