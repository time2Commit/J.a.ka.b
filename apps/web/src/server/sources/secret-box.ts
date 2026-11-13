import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { resolveAuthSecret } from "../../lib/auth-secret";

/** The stored value cannot be read: damaged, or encrypted under another `AUTH_SECRET`. */
export class SecretUnreadable extends Error {
  constructor() {
    super("The stored credentials cannot be decrypted");
  }
}

const VERSION = "v1";
const AAD = Buffer.from("jakab:source-credentials:v1");

/**
 * AES-256-GCM key derived from `AUTH_SECRET` with HKDF and a label of its own, so no new variable
 * is needed and the key is not the one that signs sessions. If `AUTH_SECRET` changes, the stored
 * credentials become unreadable (the source then asks for them again).
 */
function deriveKey(authSecret: string) {
  return Buffer.from(
    hkdfSync("sha256", authSecret, "jakab-sources", "source-credentials-aes-256-gcm", 32),
  );
}

const defaultSecret = () => resolveAuthSecret(process.env);

/** Encrypts `plain`; the result is a printable string safe to store in a text column. */
export function encryptSecret(plain: string, authSecret: string = defaultSecret()) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(authSecret), iv);
  cipher.setAAD(AAD);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), data]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

/** Decrypts what `encryptSecret` made; throws `SecretUnreadable` for anything else. */
export function decryptSecret(box: string, authSecret: string = defaultSecret()) {
  try {
    const [version, iv, tag, data] = box.split(".");
    if (version !== VERSION || !iv || !tag || data === undefined) throw new SecretUnreadable();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      deriveKey(authSecret),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(data, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new SecretUnreadable();
  }
}
