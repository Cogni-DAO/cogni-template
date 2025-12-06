// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/_fixtures/http/rate-limit-helpers`
 * Purpose: Test fixtures for rate-limited endpoint testing.
 * Scope: Provides unique IP generation per test run for rate limit isolation; helper for making requests with custom X-Real-IP header. Does NOT implement rate limiting logic.
 * Invariants: Each test file gets unique IP to avoid bucket collision across runs; IPs in TEST-NET-1 range (203.0.113.x);
 *             fetchWithIp() sends X-Real-IP (matches Caddy behavior).
 * Side-effects: none
 * Notes: Call generateUniqueTestIp() once per test file and reuse the IP for all requests in that file.
 *        X-Real-IP is set by Caddy from TCP source in production.
 * Links: Used by tests/stack/public/**, tests/stack/meta/** for public endpoint testing; see platform/infra/services/edge/configs/Caddyfile.tmpl for Caddy config.
 * @public
 */

// Use timestamp-based offset to ensure IPs are unique across test runs
// (in-memory rate limit buckets persist on server between test runs without restart)
const runOffset = Date.now() % 60000;
let testIpCounter = runOffset;

/**
 * Generate a unique test IP address for rate limit isolation.
 * Returns IPs in TEST-NET-1 range (203.0.113.x/203.0.114.x) per RFC 5737.
 * Uses timestamp-based offset to ensure uniqueness across test runs.
 *
 * Usage: Call once per test file and reuse the IP for all requests:
 * const TEST_IP = generateUniqueTestIp();
 * await fetchWithIp(url, TEST_IP);
 */
export function generateUniqueTestIp(): string {
  testIpCounter++;
  const octet3 = Math.floor(testIpCounter / 256) % 256;
  const octet4 = testIpCounter % 256;
  return `203.0.${octet3}.${octet4}`;
}

/**
 * Make HTTP request with custom X-Real-IP header.
 * Use with generateUniqueTestIp() for test isolation.
 *
 * Note: Caddy sets X-Real-IP from TCP source via header_up directive.
 * This helper simulates that for testing (real Caddy will overwrite client-supplied X-Real-IP).
 */
export async function fetchWithIp(
  url: string,
  ip: string,
  options?: RequestInit
): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      ...options?.headers,
      "X-Real-IP": ip,
    },
  });
}
