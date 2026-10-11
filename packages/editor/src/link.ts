const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const EMAIL = /^[^\s@/:]+@[^\s@/]+\.[^\s@/]+$/;
const ALLOWED = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * Turns what someone typed in the link prompt into an absolute address: "example.com" becomes
 * "https://example.com" (it would otherwise be a path relative to the app) and an e-mail address
 * becomes a `mailto:` link. Returns null for an empty value or a scheme that is not allowed.
 */
export function normalizeLinkUrl(input: string): string | null {
  const value = input.trim();
  if (value === "") return null;
  if (SCHEME.test(value) && !EMAIL.test(value)) {
    return ALLOWED.has(value.slice(0, value.indexOf(":") + 1).toLowerCase()) ? value : null;
  }
  if (EMAIL.test(value)) return `mailto:${value}`;
  return `https://${value.replace(/^\/+/, "")}`;
}
