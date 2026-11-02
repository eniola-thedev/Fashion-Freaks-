import { createHmac, timingSafeEqual } from "node:crypto";

const PROOF_LIFETIME_SECONDS = 15 * 60;

function getProofSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be configured securely to approve image uploads."
    );
  }
  return secret;
}

export function createProductImageProof(imageUrl, publicId) {
  const payload = Buffer.from(
    JSON.stringify({
      imageUrl,
      publicId,
      expiresAt: Math.floor(Date.now() / 1000) + PROOF_LIFETIME_SECONDS,
    })
  ).toString("base64url");
  const signature = createHmac("sha256", getProofSecret())
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

export function verifyProductImageProof(proof, imageUrl, publicId) {
  if (typeof proof !== "string") return false;

  const [payload, receivedSignature, extra] = proof.split(".");
  if (
    !payload ||
    payload.length > 4096 ||
    !receivedSignature ||
    receivedSignature.length !== 43 ||
    extra !== undefined
  ) {
    return false;
  }

  const expectedSignature = createHmac("sha256", getProofSecret())
    .update(payload)
    .digest();
  let actualSignature;
  try {
    actualSignature = Buffer.from(receivedSignature, "base64url");
  } catch {
    return false;
  }

  if (
    actualSignature.length !== expectedSignature.length ||
    !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    return false;
  }

  try {
    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );

    return (
      data.imageUrl === imageUrl &&
      data.publicId === publicId &&
      typeof data.expiresAt === "number" &&
      Number.isSafeInteger(data.expiresAt) &&
      data.expiresAt > Math.floor(Date.now() / 1000) &&
      data.expiresAt <=
        Math.floor(Date.now() / 1000) + PROOF_LIFETIME_SECONDS
    );
  } catch {
    return false;
  }
}
