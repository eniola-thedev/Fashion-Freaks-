import { createHash } from "node:crypto";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidEmail(value) {
  return (
    typeof value === "string" &&
    value.length <= 254 &&
    EMAIL_PATTERN.test(value)
  );
}

export function isValidCustomerPassword(value) {
  return (
    typeof value === "string" &&
    value.length >= 12 &&
    value.length <= 200
  );
}

export function hashAuthRateLimitKey(scope, identity) {
  return createHash("sha256")
    .update(`${scope}:${normalizeEmail(identity)}`)
    .digest("hex");
}

export function safeRedirectPath(value, fallback = "/account") {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return fallback;
  }

  try {
    const url = new URL(value, "https://fashion-freaks.invalid");
    if (url.origin !== "https://fashion-freaks.invalid") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
