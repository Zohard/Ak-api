/**
 * BBCode parser for backend email formatting
 * Converts common BBCode tags to email-friendly HTML
 */

export interface BBCodeRule {
    regex: RegExp;
    replacement: string | ((match: string, ...groups: string[]) => string);
}

/**
 * Basic BBCode rules for email compatibility
 */
export const bbcodeRules: BBCodeRule[] = [
    // Basic text formatting
    {
        regex: /\[b\]([\s\S]*?)\[\/b\]/gi,
        replacement: '<strong>$1</strong>'
    },
    {
        regex: /\[i\]([\s\S]*?)\[\/i\]/gi,
        replacement: '<em>$1</em>'
    },
    {
        regex: /\[u\]([\s\S]*?)\[\/u\]/gi,
        replacement: '<u>$1</u>'
    },
    {
        regex: /\[s\]([\s\S]*?)\[\/s\]/gi,
        replacement: '<del>$1</del>'
    },

    // Colors
    {
        regex: /\[color=([#\w]+)\]([\s\S]*?)\[\/color\]/gi,
        replacement: '<span style="color: $1">$2</span>'
    },

    // Sizes - converting pt to px roughly for stability in emails
    {
        regex: /\[size=(\d+)pt\]([\s\S]*?)\[\/size\]/gi,
        replacement: '<span style="font-size: $1pt">$2</span>'
    },
    {
        regex: /\[size=(\d+)\]([\s\S]*?)\[\/size\]/gi,
        replacement: '<span style="font-size: $1px">$2</span>'
    },

    // URLs - with custom text
    {
        regex: /\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi,
        replacement: (match: string, url: string, text: string) => {
            const cleanUrl = sanitizeUrl(url);
            return `<a href="${cleanUrl}" target="_blank" style="color: #2563eb; text-decoration: underline;">${text}</a>`;
        }
    },

    // URLs - just the URL
    {
        regex: /\[url\]([\s\S]*?)\[\/url\]/gi,
        replacement: (match: string, url: string) => {
            const cleanUrl = sanitizeUrl(url);
            return `<a href="${cleanUrl}" target="_blank" style="color: #2563eb; text-decoration: underline;">${cleanUrl}</a>`;
        }
    },

    // Images
    {
        regex: /\[img\]([\s\S]*?)\[\/img\]/gi,
        replacement: (match: string, url: string) => {
            const cleanUrl = sanitizeUrl(url);
            return `<img src="${cleanUrl}" alt="Image" style="max-width: 100%; height: auto; border-radius: 4px; margin: 10px 0;" />`;
        }
    },

    // Alignment
    {
        regex: /\[center\]([\s\S]*?)\[\/center\]/gi,
        replacement: '<div style="text-align: center; margin: 10px 0;">$1</div>'
    },

    // Quotes - Simple format with author
    {
        regex: /\[quote=([^\]]+)\]([\s\S]*?)\[\/quote\]/gi,
        replacement: '<blockquote style="border-left: 4px solid #e5e7eb; padding-left: 15px; margin: 15px 0; color: #4b5563;"><div style="font-size: 13px; font-weight: 600; margin-bottom: 5px;">$1 a écrit:</div>$2</blockquote>'
    },
    // Quotes - Simple format without author
    {
        regex: /\[quote\]([\s\S]*?)\[\/quote\]/gi,
        replacement: '<blockquote style="border-left: 4px solid #e5e7eb; padding-left: 15px; margin: 15px 0; color: #4b5563;">$1</blockquote>'
    },

    // Spoilers (Simplified for email)
    {
        regex: /\[spoiler(?:=[^\]]+)?\]([\s\S]*?)\[\/spoiler\]/gi,
        replacement: '<div style="background-color: #f3f4f6; border: 1px dashed #d1d5db; padding: 10px; border-radius: 4px; font-style: italic;">[Contenu caché / Spoiler]</div>'
    },
];

/**
 * Parse BBCode text and convert to HTML
 */
export function parseBBCode(text: string): string {
    if (!text) return '';

    let result = text;

    // Basic HTML escaping - simplified replacement for document.createElement approach
    result = result
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    // Convert line breaks
    result = result.replace(/\n\n+/g, '<br><br>');
    result = result.replace(/\n/g, '<br>');

    // Apply all BBCode rules
    for (const rule of bbcodeRules) {
        result = result.replace(rule.regex, rule.replacement as any);
    }

    return result;
}

/**
 * Sanitize URL to prevent basic XSS
 */
function sanitizeUrl(url: string): string {
    const cleanUrl = url.trim();
    // Remove any potential javascript: or data: schemes
    if (/^(javascript|data|vbscript):/i.test(cleanUrl)) {
        return '#';
    }

    // If it doesn't start with http/https, add https
    if (!/^https?:\/\//i.test(cleanUrl)) {
        return `https://${cleanUrl}`;
    }

    return cleanUrl;
}

/**
 * Strip BBCode tags and return plain text
 */
export function stripBBCode(text: string): string {
    if (!text) return '';
    return text.replace(/\[[^\]]*\]/g, '').trim();
}
