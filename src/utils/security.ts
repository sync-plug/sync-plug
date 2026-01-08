import { createHash, randomBytes } from "crypto";
import { jwtDecode, JwtPayload } from "jwt-decode";

/**
 * Generate a secure random state parameter for OAuth flows
 */
export function generateState(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Generate a unique ID using MD5 hash of timestamp
 */
export function generateId(): string {
  return createHash("md5")
    .update(new Date().getTime().toString())
    .digest("hex");
}

/**
 * Create a high-entropy cryptographic random string between 43 and 128 chars,
 * URL-safe (RFC 7636 §4.1).
 */
export function generateCodeVerifier(length = 64): string {
  if (length < 43 || length > 128) {
    throw new Error(
      "PKCE code_verifier must be between 43 and 128 characters"
    );
  }
  // 3/4 of length in bytes → base64 expands to ~length chars
  const buffer = randomBytes(Math.ceil((length * 3) / 4));
  return base64UrlEncode(buffer).substring(0, length);
}

/**
 * Compute the SHA-256 digest of the verifier and return a URL-safe
 * base64-encoded string (RFC 7636 §4.2).
 */
export function generateCodeChallenge(codeVerifier: string): string {
  const hash = createHash("sha256").update(codeVerifier).digest();
  return base64UrlEncode(hash);
}

/**
 * Helper to make a Buffer or Uint8Array into URL-safe Base64 (RFC 4648 §5).
 */
function base64UrlEncode(buffer: Buffer | Uint8Array): string {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Checks if a JWT token string has expired.
 * Relies on the 'exp' claim standard in JWTs.
 */
export function isTokenExpired(token: string | undefined | null): boolean {
  if (!token) {
    return true; // Treat missing token as expired/invalid
  }
  try {
    const decoded = jwtDecode<JwtPayload>(token);

    if (typeof decoded.exp === "number") {
      const nowInSeconds = Date.now() / 1000;
      return nowInSeconds >= decoded.exp;
    } else {
      // If 'exp' claim is missing, treat as potentially problematic
      return true;
    }
  } catch (e) {
    // If decoding fails, the token is invalid
    return true;
  }
}

/**
 * Checks if an error likely indicates an authentication/authorization issue.
 */
export function isAuthError(
  platform: string,
  err: any
): boolean {
  if (!err) return false;
  const message = (err.message || "").toLowerCase();
  const status = err.status || err?.response?.status || err.code;

  if (status === 401 || status === 403) return true;
  if (message.includes("authentication") || message.includes("authenticate"))
    return true;
  if (message.includes("invalid_token") || message.includes("invalid_grant"))
    return true;

  // Platform-specific checks
  if (platform === "twitter") {
    const twitterDataError =
      err.data?.error?.toLowerCase() ||
      err.data?.type?.toLowerCase() ||
      err.data?.title?.toLowerCase();
    if (
      twitterDataError?.includes("invalid_token") ||
      twitterDataError?.includes("invalid request") ||
      twitterDataError?.includes("authenticity token required")
    )
      return true;
  } else if (platform === "bluesky") {
    if (status === 400 && message.includes("invalid handle or password"))
      return true;
    if (message.includes("could not resolve handle")) return true;
  } else if (platform === "linkedin") {
    if (message.includes("unauthorized") || message.includes("invalid_token"))
      return true;
  }

  return false;
}

