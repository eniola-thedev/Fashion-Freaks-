import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";

async function request(path, options = {}) {
  return fetch(new URL(path, baseUrl), {
    redirect: "manual",
    cache: "no-store",
    ...options,
  });
}

test("admin pages redirect unauthenticated visitors to login", async () => {
  for (const path of ["/admin", "/admin/products", "/admin/orders"]) {
    const response = await request(path);
    if ([302, 307].includes(response.status)) {
      assert.match(response.headers.get("location") ?? "", /\/admin\/login/);
    } else {
      assert.equal(response.status, 200, `${path}: ${response.status}`);
      assert.match(await response.text(), /NEXT_REDIRECT/);
      assert.match(
        response.headers.get("cache-control") ?? "",
        /no-store/
      );
    }
  }
});

test("admin APIs and image uploads reject unauthenticated requests", async () => {
  for (const path of [
    "/api/auth/session",
    "/api/admin/analytics",
    "/api/admin/products",
    "/api/admin/orders",
  ]) {
    const response = await request(path);
    assert.equal(response.status, 401, `${path}: ${response.status}`);
  }

  const uploadResponse = await request("/api/admin/products/upload", {
    method: "POST",
    body: new FormData(),
  });
  assert.equal(uploadResponse.status, 401);
});

test("invalid checkout and payment requests are rejected without writes", async () => {
  const orderResponse = await request("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(orderResponse.status, 400);

  const initializeResponse = await request("/api/payments/initialize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderNumber: "" }),
  });
  assert.equal(initializeResponse.status, 400);

  const verifyResponse = await request("/api/payments/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reference: "" }),
  });
  assert.equal(verifyResponse.status, 400);
});

test("Paystack webhook rejects unsigned requests", async () => {
  const response = await request("/api/webhooks/paystack", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "charge.success" }),
  });

  assert.equal(response.status, 401);
});

test("reservation cleanup rejects calls without its bearer secret", async () => {
  const response = await request("/api/cron/cleanup-orders");
  assert.equal(response.status, 401);
});
