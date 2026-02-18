import { importJWK, jwtVerify, decodeProtectedHeader, type CryptoKey } from "jose"
import { createHash } from "crypto"
import { plaidClient } from "@/lib/plaid"

// Cache verified keys with TTL (30 minutes)
const KEY_CACHE_TTL = 30 * 60 * 1000
const keyCache = new Map<string, { key: CryptoKey; expiresAt: number }>()

async function getVerificationKey(kid: string): Promise<CryptoKey> {
  const cached = keyCache.get(kid)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.key
  }

  const response = await plaidClient.webhookVerificationKeyGet({ key_id: kid })
  const jwk = response.data.key
  const key = await importJWK(jwk) as CryptoKey

  keyCache.set(kid, { key, expiresAt: Date.now() + KEY_CACHE_TTL })
  return key
}

/**
 * Verify a Plaid webhook request using JWT signature verification.
 *
 * @param rawBody - The raw request body as a string
 * @param plaidVerificationHeader - The `Plaid-Verification` header value (JWT)
 * @returns true if the webhook is valid
 * @throws Error if verification fails
 */
export async function verifyPlaidWebhook(
  rawBody: string,
  plaidVerificationHeader: string
): Promise<boolean> {
  // Decode the JWT header to get the key ID
  const header = decodeProtectedHeader(plaidVerificationHeader)
  if (!header.kid) {
    throw new Error("Missing kid in JWT header")
  }

  // Fetch (or use cached) verification key
  let key: CryptoKey
  try {
    key = await getVerificationKey(header.kid)
  } catch {
    // If cached key fails, evict and retry
    keyCache.delete(header.kid)
    key = await getVerificationKey(header.kid)
  }

  // Verify the JWT signature and claims
  const { payload } = await jwtVerify(plaidVerificationHeader, key, {
    maxTokenAge: "5 min",
  })

  // Verify the request body hash matches the claim
  const expectedHash = payload.request_body_sha256 as string | undefined
  if (!expectedHash) {
    throw new Error("Missing request_body_sha256 in JWT payload")
  }

  const actualHash = createHash("sha256").update(rawBody).digest("hex")
  if (actualHash !== expectedHash) {
    throw new Error("Request body hash mismatch")
  }

  return true
}
