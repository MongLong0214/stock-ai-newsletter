/**
 * SSRF-safe URL validation.
 *
 * Validates a URL against:
 * - Allowed schemes (http/https only)
 * - No embedded credentials
 * - No localhost, private, link-local, or reserved IP ranges
 * - DNS resolution check (resolved IPs must not be private)
 * - Redirect-hop validation (configurable max hops)
 */

import { lookup } from 'dns/promises';
import { isIPv4 } from 'net';

export interface UrlValidationOptions {
  /** Allowed schemes. Default: ['https'] */
  allowedSchemes?: string[];
  /** Max redirect hops to follow for validation. Default: 3 */
  maxRedirects?: number;
  /** Whether to perform DNS resolution check. Default: true */
  checkDns?: boolean;
  /** Additional blocked hostnames. Default: [] */
  blockedHostnames?: string[];
}

export interface UrlValidationResult {
  safe: boolean;
  reason?: string;
}

const PRIVATE_RANGES_V4: Array<{ prefix: number; mask: number }> = [
  { prefix: 0x0A000000, mask: 0xFF000000 }, // 10.0.0.0/8
  { prefix: 0xAC100000, mask: 0xFFF00000 }, // 172.16.0.0/12
  { prefix: 0xC0A80000, mask: 0xFFFF0000 }, // 192.168.0.0/16
  { prefix: 0x7F000000, mask: 0xFF000000 }, // 127.0.0.0/8
  { prefix: 0xA9FE0000, mask: 0xFFFF0000 }, // 169.254.0.0/16 (link-local)
  { prefix: 0x00000000, mask: 0xFF000000 }, // 0.0.0.0/8
  { prefix: 0xC0000000, mask: 0xFFFFFFF8 }, // 192.0.0.0/29 (IANA special)
  { prefix: 0xC0000200, mask: 0xFFFFFF00 }, // 192.0.2.0/24 (TEST-NET-1)
  { prefix: 0xC6336400, mask: 0xFFFFFF00 }, // 198.51.100.0/24 (TEST-NET-2)
  { prefix: 0xCB007100, mask: 0xFFFFFF00 }, // 203.0.113.0/24 (TEST-NET-3)
  { prefix: 0xE0000000, mask: 0xF0000000 }, // 224.0.0.0/4 (multicast)
  { prefix: 0xF0000000, mask: 0xF0000000 }, // 240.0.0.0/4 (reserved)
  { prefix: 0xFFFFFFFF, mask: 0xFFFFFFFF }, // 255.255.255.255 (broadcast)
  { prefix: 0xC6120000, mask: 0xFFFE0000 }, // 198.18.0.0/15 (benchmark)
];

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.');
  return (
    ((parseInt(parts[0]) << 24) |
      (parseInt(parts[1]) << 16) |
      (parseInt(parts[2]) << 8) |
      parseInt(parts[3])) >>>
    0
  );
}

export function isPrivateOrReservedIp(ip: string): boolean {
  // Strip brackets for IPv6 (e.g. [::1])
  const cleaned = ip.startsWith('[') && ip.endsWith(']') ? ip.slice(1, -1) : ip;

  if (!isIPv4(cleaned)) {
    // IPv6 checks
    const lower = cleaned.toLowerCase();
    if (
      lower === '::1' ||                     // loopback
      lower === '::' ||                      // unspecified
      lower.startsWith('fe80:') ||           // link-local
      lower.startsWith('fc') ||              // unique-local fc00::/7
      lower.startsWith('fd') ||              // unique-local fd00::/8
      lower.startsWith('ff') ||              // multicast ff00::/8
      lower.startsWith('100:') ||            // discard 100::/64
      lower.startsWith('2001:db8:') ||       // documentation 2001:db8::/32
      lower.startsWith('::ffff:')            // IPv4-mapped
    ) {
      // For IPv4-mapped, check the mapped address
      if (lower.startsWith('::ffff:')) {
        const v4Part = lower.slice(7);
        if (isIPv4(v4Part)) {
          return isPrivateOrReservedIp(v4Part);
        }
      }
      return true;
    }
    return false;
  }

  const ipInt = ipv4ToInt(cleaned);
  return PRIVATE_RANGES_V4.some(({ prefix, mask }) => ((ipInt & mask) >>> 0) === (prefix >>> 0));
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata',
  '169.254.169.254', // cloud metadata
]);

/**
 * Validate a URL for SSRF safety.
 * Call before making any outbound request.
 */
export async function validateUrlSafety(
  rawUrl: string,
  options: UrlValidationOptions = {}
): Promise<UrlValidationResult> {
  const {
    allowedSchemes = ['https'],
    checkDns = true,
    blockedHostnames = [],
  } = options;

  // Parse URL
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { safe: false, reason: 'Invalid URL format' };
  }

  // Scheme check
  const scheme = parsed.protocol.replace(':', '');
  if (!allowedSchemes.includes(scheme)) {
    return { safe: false, reason: `Scheme '${scheme}' not allowed. Allowed: ${allowedSchemes.join(', ')}` };
  }

  // Credentials check
  if (parsed.username || parsed.password) {
    return { safe: false, reason: 'URLs with embedded credentials are not allowed' };
  }

  // Hostname checks
  const hostname = parsed.hostname.toLowerCase();

  if (!hostname || hostname.length === 0) {
    return { safe: false, reason: 'Empty hostname' };
  }

  const allBlocked = new Set([...BLOCKED_HOSTNAMES, ...blockedHostnames.map((h) => h.toLowerCase())]);
  if (allBlocked.has(hostname)) {
    return { safe: false, reason: `Hostname '${hostname}' is blocked` };
  }

  // Check if hostname is a raw IP (including bracketed IPv6)
  const rawHostname = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;

  if (isIPv4(rawHostname) || rawHostname.includes(':')) {
    if (isPrivateOrReservedIp(rawHostname)) {
      return { safe: false, reason: `IP address '${hostname}' is private/reserved` };
    }
  }

  // DNS resolution check
  if (checkDns && !isIPv4(hostname)) {
    try {
      const addresses = await lookup(hostname, { all: true });
      for (const addr of Array.isArray(addresses) ? addresses : [addresses]) {
        const ip = typeof addr === 'string' ? addr : addr.address;
        if (isPrivateOrReservedIp(ip)) {
          return {
            safe: false,
            reason: `Hostname '${hostname}' resolves to private/reserved IP '${ip}'`,
          };
        }
      }
    } catch (err) {
      return {
        safe: false,
        reason: `DNS resolution failed for '${hostname}': ${err instanceof Error ? err.message : 'unknown error'}`,
      };
    }
  }

  return { safe: true };
}

/**
 * Validate redirect targets during a multi-hop fetch.
 * Call this for each redirect location before following it.
 */
export async function validateRedirectHop(
  location: string,
  baseUrl: string,
  hopNumber: number,
  maxRedirects: number = 3
): Promise<UrlValidationResult> {
  if (hopNumber > maxRedirects) {
    return { safe: false, reason: `Exceeded maximum redirect hops (${maxRedirects})` };
  }

  // Resolve relative redirects against the base
  let absoluteUrl: string;
  try {
    absoluteUrl = new URL(location, baseUrl).toString();
  } catch {
    return { safe: false, reason: 'Invalid redirect location' };
  }

  return validateUrlSafety(absoluteUrl, {
    allowedSchemes: ['http', 'https'],
    checkDns: true,
  });
}
