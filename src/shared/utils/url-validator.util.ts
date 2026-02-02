import { BadRequestException } from '@nestjs/common';
import * as dns from 'dns';
import { promisify } from 'util';

const dnsLookup = promisify(dns.lookup);

/**
 * List of allowed domains for URL fetching (whitelist approach for image uploads)
 * Add domains as needed for legitimate image sources
 */
const ALLOWED_IMAGE_DOMAINS = [
  // CDN and image hosting
  'cdn.myanimelist.net',
  'img.anili.st',
  's4.anilist.co',
  'media.kitsu.io',
  'artworks.thetvdb.com',
  'image.tmdb.org',
  'images.igdb.com',
  // Book cover sources
  'booknode.com',
  'babelio.com',
  'fnac.com',
  'images-na.ssl-images-amazon.com',
  'images-eu.ssl-images-amazon.com',
  'm.media-amazon.com',
  // General image CDNs
  'i.imgur.com',
  'imgur.com',
  'upload.wikimedia.org',
  'staticflickr.com',
  // Manga sources
  'nautiljon.com',
  'www.nautiljon.com',
];

/**
 * Private/internal IP ranges that should never be accessed
 */
const PRIVATE_IP_PATTERNS = [
  /^127\./,                    // Loopback
  /^10\./,                     // Private Class A
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private Class B
  /^192\.168\./,               // Private Class C
  /^169\.254\./,               // Link-local (AWS metadata, etc.)
  /^0\./,                      // Current network
  /^100\.(6[4-9]|[7-9][0-9]|1[0-2][0-9])\./, // Carrier-grade NAT
  /^198\.18\./,                // Benchmarking
  /^::1$/,                     // IPv6 loopback
  /^fc00:/i,                   // IPv6 unique local
  /^fe80:/i,                   // IPv6 link-local
  /^fd/i,                      // IPv6 private
];

/**
 * Blocked hostnames
 */
const BLOCKED_HOSTNAMES = [
  'localhost',
  'localhost.localdomain',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
  'metadata.google.internal',
  'metadata',
  'kubernetes.default',
  'kubernetes.default.svc',
];

/**
 * Check if an IP address is private/internal
 */
function isPrivateIP(ip: string): boolean {
  return PRIVATE_IP_PATTERNS.some(pattern => pattern.test(ip));
}

/**
 * Check if hostname is blocked
 */
function isBlockedHostname(hostname: string): boolean {
  const lowerHostname = hostname.toLowerCase();
  return BLOCKED_HOSTNAMES.some(blocked =>
    lowerHostname === blocked || lowerHostname.endsWith('.' + blocked)
  );
}

/**
 * Validate URL for SSRF protection (strict mode for image uploads)
 * Uses whitelist approach - only allows known safe domains
 */
export async function validateImageUrl(url: string): Promise<void> {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new BadRequestException('Invalid URL format');
  }

  // Only allow HTTP(S)
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new BadRequestException('Invalid URL protocol. Only HTTP(S) allowed');
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  // Check against blocked hostnames
  if (isBlockedHostname(hostname)) {
    throw new BadRequestException('URL hostname is not allowed');
  }

  // Check if domain is in whitelist
  const isAllowed = ALLOWED_IMAGE_DOMAINS.some(domain =>
    hostname === domain || hostname.endsWith('.' + domain)
  );

  if (!isAllowed) {
    throw new BadRequestException(
      `Domain '${hostname}' is not in the allowed list for image uploads. ` +
      'Contact admin to add new domains.'
    );
  }

  // DNS resolution check to prevent DNS rebinding attacks
  try {
    const { address } = await dnsLookup(hostname);
    if (isPrivateIP(address)) {
      throw new BadRequestException('URL resolves to a private IP address');
    }
  } catch (error) {
    if (error instanceof BadRequestException) {
      throw error;
    }
    throw new BadRequestException(`Unable to resolve hostname: ${hostname}`);
  }
}

/**
 * Validate URL for metadata fetching (less strict, but still safe)
 * Blocks private IPs but allows any public domain
 */
export async function validateMetadataUrl(url: string): Promise<void> {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new BadRequestException('Invalid URL format');
  }

  // Only allow HTTP(S)
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new BadRequestException('Invalid URL protocol. Only HTTP(S) allowed');
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  // Check against blocked hostnames
  if (isBlockedHostname(hostname)) {
    throw new BadRequestException('URL hostname is not allowed');
  }

  // Block IP addresses directly in URL (force DNS resolution)
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^\[?([a-fA-F0-9:]+)\]?$/;

  if (ipv4Regex.test(hostname) || ipv6Regex.test(hostname)) {
    throw new BadRequestException('Direct IP addresses are not allowed in URLs');
  }

  // DNS resolution check
  try {
    const { address } = await dnsLookup(hostname);
    if (isPrivateIP(address)) {
      throw new BadRequestException('URL resolves to a private IP address');
    }
  } catch (error) {
    if (error instanceof BadRequestException) {
      throw error;
    }
    throw new BadRequestException(`Unable to resolve hostname: ${hostname}`);
  }
}

/**
 * Add a domain to the allowed list (for runtime additions)
 * This should be called from admin endpoints if needed
 */
export function addAllowedImageDomain(domain: string): void {
  const lowerDomain = domain.toLowerCase().trim();
  if (!ALLOWED_IMAGE_DOMAINS.includes(lowerDomain)) {
    ALLOWED_IMAGE_DOMAINS.push(lowerDomain);
  }
}

/**
 * Get current allowed domains list
 */
export function getAllowedImageDomains(): string[] {
  return [...ALLOWED_IMAGE_DOMAINS];
}
