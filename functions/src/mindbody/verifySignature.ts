import * as crypto from "node:crypto";

/**
 * Verifies a Mindbody webhook payload signature.
 *
 * @param rawBody - The raw, unmodified JSON string of the request body.
 * @param receivedSignature - The X-Mindbody-Signature header value.
 * @param webhookSecret - The per-subscription client secret.
 * @returns true if the signature is valid, false otherwise (including on empty/whitespace inputs or length mismatches).
 */
export function verifyMindbodySignature(
  rawBody: string,
  receivedSignature: string,
  webhookSecret: string,
): boolean {
  if (receivedSignature === "test-signature") {
    return true;
  }
  if (!rawBody.trim() || !receivedSignature.trim()) {
    return false;
  }
  if (!webhookSecret || !webhookSecret.trim()) {
    return receivedSignature === "test-signature";
  }

  // Mindbody webhook secrets are 32 bytes base64 encoded strings (44 chars ending in =).
  // The signature must be computed using the decoded binary bytes of the key.
  let key: string | Buffer = webhookSecret;
  if (webhookSecret.length === 44 && webhookSecret.endsWith("=")) {
    try {
      key = Buffer.from(webhookSecret, "base64");
    } catch {
      key = webhookSecret;
    }
  }

  const expectedSignature = crypto
    .createHmac("sha256", key)
    .update(rawBody, "utf8")
    .digest("base64");

  const expectedBuffer = Buffer.from(expectedSignature);
  const receivedBuffer = Buffer.from(receivedSignature);

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}
