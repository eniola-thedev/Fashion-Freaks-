import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyPaystackSignature(rawBody, signature, secretKey) {
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) {
    return false;
  }

  const expected = createHmac("sha512", secretKey)
    .update(rawBody)
    .digest();
  const received = Buffer.from(signature, "hex");

  return (
    received.length === expected.length &&
    timingSafeEqual(received, expected)
  );
}

export function parsePaystackTransaction(value) {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const customer = value.customer;
  if (typeof customer !== "object" || customer === null) {
    return null;
  }

  const email = customer.email;
  if (
    typeof value.reference !== "string" ||
    typeof value.status !== "string" ||
    !Number.isSafeInteger(value.amount) ||
    typeof value.currency !== "string" ||
    typeof email !== "string"
  ) {
    return null;
  }

  return {
    reference: value.reference,
    status: value.status,
    amount: value.amount,
    currency: value.currency,
    customer: { email },
  };
}

export function matchesPaystackTransaction(transaction, order) {
  return (
    transaction.reference === order.paymentReference &&
    transaction.amount === order.total * 100 &&
    transaction.currency === "NGN" &&
    transaction.customer.email.toLowerCase() ===
      order.customerEmail.toLowerCase()
  );
}
