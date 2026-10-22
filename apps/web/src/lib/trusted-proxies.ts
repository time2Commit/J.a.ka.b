/**
 * Addresses (or CIDR ranges) of a reverse proxy placed in front of this stack's own proxy, from
 * `TRUSTED_PROXIES` (separated by spaces or commas). Empty by default: the proxy in the stack is
 * then the only hop and the client address is whatever it reports.
 */
export function parseTrustedProxies(value: string | undefined): string[] {
  return (value ?? "").split(/[\s,]+/).filter(Boolean);
}
