import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const required = [
  "E2E_BASE_URL",
  "E2E_ADMIN_EMAIL",
  "E2E_ADMIN_PASSWORD",
  "E2E_CUSTOMER_EMAIL",
  "E2E_CUSTOMER_PASSWORD",
  "E2E_IMAGE_PATH",
  "E2E_PAYSTACK_SECRET_KEY",
];
for (const key of required) {
  if (!process.env[key]) throw new Error(`${key} is required.`);
}

if (
  process.env.E2E_CONFIRM_ISOLATED_DATABASE !== "YES" ||
  process.env.E2E_CONFIRM_SANDBOX_PAYMENT !== "YES"
) {
  throw new Error(
    "Set both E2E_CONFIRM_ISOLATED_DATABASE=YES and E2E_CONFIRM_SANDBOX_PAYMENT=YES only for an isolated non-production test environment."
  );
}

const baseUrl = new URL(process.env.E2E_BASE_URL);
const isLocal =
  baseUrl.hostname === "localhost" ||
  baseUrl.hostname === "127.0.0.1" ||
  baseUrl.hostname === "::1";
if (!isLocal && process.env.E2E_ALLOW_REMOTE_TARGET !== "YES") {
  throw new Error(
    "Remote E2E targets require E2E_ALLOW_REMOTE_TARGET=YES."
  );
}

const paystackSecret = process.env.E2E_PAYSTACK_SECRET_KEY;
if (!paystackSecret.startsWith("sk_test_")) {
  throw new Error(
    "E2E_PAYSTACK_SECRET_KEY must be a Paystack sandbox secret key."
  );
}

const imagePath = process.env.E2E_IMAGE_PATH;
const imageBytes = await readFile(imagePath);
const extension = imagePath.split(".").pop()?.toLowerCase();
const mimeTypes = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
const mimeType = extension ? mimeTypes[extension] : undefined;
if (!mimeType) {
  throw new Error("E2E_IMAGE_PATH must be a JPEG, PNG, or WebP file.");
}

let sessionCookie = "";
let createdProduct;
let createdOrderNumber = "";

async function call(path, options = {}, cookie = sessionCookie) {
  const headers = new Headers(options.headers);
  if (cookie) headers.set("Cookie", cookie);
  const response = await fetch(new URL(path, baseUrl), {
    ...options,
    headers,
    redirect: "manual",
    cache: "no-store",
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(
      `${options.method ?? "GET"} ${path} failed (${response.status}): ${
        typeof data === "object" ? data?.error ?? text : text
      }`
    );
  }

  return { response, data };
}

function getSupabaseSessionCookie(response) {
  const cookies = response.headers
    .getSetCookie()
    .filter((value) => value.startsWith("sb-"))
    .map((value) => value.split(";", 1)[0]);
  assert.ok(cookies.length, "Supabase login did not create an authenticated session.");
  return cookies.join("; ");
}

async function assertAdminRedirect() {
  const response = await fetch(new URL("/admin", baseUrl), {
    redirect: "manual",
    cache: "no-store",
  });
  if ([302, 307].includes(response.status)) {
    assert.match(response.headers.get("location") ?? "", /\/admin\/login/);
    return;
  }

  assert.equal(response.status, 200);
  assert.match(await response.text(), /NEXT_REDIRECT/);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
}

async function uploadImage() {
  const form = new FormData();
  form.append(
    "file",
    new Blob([imageBytes], { type: mimeType }),
    `e2e-product.${extension}`
  );
  const { data } = await call("/api/admin/products/upload", {
    method: "POST",
    body: form,
  });
  assert.match(data.publicId, /^supabase\/fashion-freaks\/products\//);
  assert.match(data.imageUrl, /^https:\/\/[^/]+\/storage\/v1\/object\/public\//);
  assert.ok(data.proof);
  return data;
}

async function paystackTransaction(reference) {
  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${paystackSecret}` },
      cache: "no-store",
    }
  );
  const result = await response.json();
  if (!response.ok || result.status !== true || !result.data) {
    throw new Error("Paystack sandbox could not verify the transaction.");
  }
  return result.data;
}

try {
  const login = await call("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.E2E_ADMIN_EMAIL,
      password: process.env.E2E_ADMIN_PASSWORD,
    }),
  });
  const adminCookie = getSupabaseSessionCookie(login.response);
  sessionCookie = adminCookie;

  const session = await call("/api/auth/session");
  assert.equal(session.data.authenticated, true);
  await call("/admin");
  await call("/api/admin/analytics");
  await call("/api/admin/products");
  await call("/api/admin/orders");

  const firstImage = await uploadImage();
  const secondImage = await uploadImage();
  const suffix = randomUUID().slice(0, 8);
  const create = await call("/api/admin/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `E2E test product ${suffix}`,
      description: "Temporary pre-launch sandbox test product.",
      price: 1000,
      discountPrice: 900,
      isFeatured: true,
      category: "Other",
      colour: "Black",
      imageUrl: firstImage.imageUrl,
      imagePublicId: firstImage.publicId,
      imageUploadProof: firstImage.proof,
      colours: [
        {
          name: "Black",
          hexColor: "#111111",
          images: [
            {
              imageUrl: firstImage.imageUrl,
              imagePublicId: firstImage.publicId,
              imageUploadProof: firstImage.proof,
              isPrimary: true,
            },
          ],
        },
        {
          name: "Navy Blue",
          hexColor: "#14213d",
          images: [
            {
              imageUrl: secondImage.imageUrl,
              imagePublicId: secondImage.publicId,
              imageUploadProof: secondImage.proof,
              isPrimary: true,
            },
          ],
        },
      ],
      variants: [
        { colour: "Black", size: "S", stock: 3 },
        { colour: "Black", size: "M", stock: 5 },
        { colour: "Navy Blue", size: "M", stock: 2 },
      ],
    }),
  });
  assert.equal(create.response.status, 201);
  createdProduct = create.data.product;

  const variant = await call(
    `/api/admin/products/${createdProduct.id}/variants`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ colour: "Black", size: "S", stock: 1 }),
    }
  );

  const replacementImage = await uploadImage();
  const replacement = await call(
    `/api/admin/products/${createdProduct.id}`,
    {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      description: "Updated through the sandbox E2E test.",
      imageUrl: replacementImage.imageUrl,
      imagePublicId: replacementImage.publicId,
      imageUploadProof: replacementImage.proof,
      variants: [{ colour: "Black", size: "M", stock: 7 }],
      colours: [
        {
          name: "Black",
          hexColor: "#111111",
          images: [
            {
              imageUrl: firstImage.imageUrl,
              imagePublicId: firstImage.publicId,
              imageUploadProof: firstImage.proof,
              isPrimary: true,
            },
          ],
        },
        {
          name: "Navy Blue",
          hexColor: "#14213d",
          images: [
            {
              imageUrl: secondImage.imageUrl,
              imagePublicId: secondImage.publicId,
              imageUploadProof: secondImage.proof,
              isPrimary: true,
            },
          ],
        },
      ],
      removedVariantIds: [],
    }),
    }
  );
  assert.equal(
    replacement.data.warning,
    undefined,
    "The replaced product image could not be cleaned up."
  );

  const { data: productList } = await call("/api/products");
  const visibleProduct = productList.find(
    (product) => product.id === createdProduct.id
  );
  assert.equal(visibleProduct?.imageUrl, replacementImage.imageUrl);
  assert.equal(visibleProduct?.discountPrice, 900);
  assert.equal(visibleProduct?.isFeatured, true);
  assert.deepEqual(
    visibleProduct?.colours.map((colour) => colour.name),
    ["Black", "Navy Blue"]
  );
  assert.deepEqual(
    visibleProduct?.variants.map((item) => [item.colour, item.size, item.stock]),
    [
      ["Black", "M", 7],
      ["Black", "S", 1],
      ["Navy Blue", "M", 2],
    ]
  );
  assert.equal("imagePublicId" in (visibleProduct ?? {}), false);
  const imageResponse = await fetch(replacementImage.imageUrl, {
    method: "HEAD",
  });
  assert.ok(imageResponse.ok,   "Uploaded Supabase Storage image is not reachable.");
  assert.ok(
    visibleProduct?.colours.every((colour) =>
      colour.images.some((image) => image.isPrimary)
    ),
    "Each colour does not have a persisted main image."
  );

  const detailResponse = await fetch(
    new URL(`/products/${createdProduct.slug}`, baseUrl),
    { cache: "no-store" }
  );
  assert.equal(detailResponse.status, 200);
  const productHtml = await detailResponse.text();
  assert.ok(
    productHtml.includes(replacementImage.imageUrl) &&
      productHtml.includes(firstImage.imageUrl) &&
      productHtml.includes(secondImage.imageUrl) &&
      productHtml.includes("Navy Blue"),
    "Product detail page did not render the persistent image URL."
  );

  const customer = {
    fullName: "Fashion Freaks Sandbox Test",
    email: `e2e-${suffix}@example.com`,
    phone: "+2348000000000",
    state: "Lagos",
    city: "Surulere",
    address: "Teslim Balogun Stadium, Alh. Masha Road",
    deliveryNotes: "",
  };
  const items = [
    {
      productId: createdProduct.id,
      variantId: variant.data.variant.id,
      quantity: 1,
    },
  ];
  const { data: deliveryQuote } = await call("/api/shipping/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customer, items }),
  });
  assert.ok(
    Number.isSafeInteger(deliveryQuote.deliveryFee) &&
      deliveryQuote.deliveryFee > 0,
    "Shipbubble did not return a valid sandbox delivery rate."
  );

  const customerLogin = await call("/api/customer/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.E2E_CUSTOMER_EMAIL,
      password: process.env.E2E_CUSTOMER_PASSWORD,
    }),
  });
  const customerCookie = getSupabaseSessionCookie(customerLogin.response);

  const order = await call("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      checkoutKey: randomUUID(),
      customer,
      items,
      expectedDeliveryFee: deliveryQuote.deliveryFee,
    }),
  }, customerCookie);
  createdOrderNumber = order.data.order.orderNumber;

  const initialized = await call("/api/payments/initialize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderNumber: createdOrderNumber }),
  }, customerCookie);
  assert.match(initialized.data.authorizationUrl, /^https:\/\/checkout\.paystack\.com\//);

  const { data: orders } = await call("/api/admin/orders");
  const savedOrder = orders.orders.find(
    (entry) => entry.orderNumber === createdOrderNumber
  );
  assert.ok(savedOrder?.paymentReference);
  assert.deepEqual(
    savedOrder?.items.map((item) => [
      item.colour,
      item.size,
      item.unitPrice,
      item.quantity,
    ]),
    [["Black", "S", 900, 1]]
  );

  console.log(
    `Complete this real Paystack sandbox payment, then return here:\n${initialized.data.authorizationUrl}`
  );
  const prompt = createInterface({ input: stdin, output: stdout });
  await prompt.question("Press Enter after completing the sandbox payment: ");
  prompt.close();

  let transaction;
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    transaction = await paystackTransaction(savedOrder.paymentReference);
    if (transaction.status === "success" || transaction.status === "failed") {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }

  if (transaction?.status !== "success") {
    throw new Error(
      `Paystack sandbox transaction is not successful (status: ${
        transaction?.status ?? "unknown"
      }). No payment was marked successful by this test.`
    );
  }

  const webhookBody = JSON.stringify({
    event: "charge.success",
    data: transaction,
  });
  const signature = createHmac("sha512", paystackSecret)
    .update(webhookBody)
    .digest("hex");
  await call("/api/webhooks/paystack", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-paystack-signature": signature,
    },
    body: webhookBody,
  });

  const afterWebhook = await call("/api/admin/orders");
  const webhookOrder = afterWebhook.data.orders.find(
    (entry) => entry.orderNumber === createdOrderNumber
  );
  assert.equal(
    webhookOrder?.paymentStatus,
    "PAID",
    "The verified webhook did not mark the sandbox order paid."
  );
  const stockAfterCheckout = await call("/api/admin/products");
  const orderedProduct = stockAfterCheckout.data.products.find(
    (product) => product.id === createdProduct.id
  );
  assert.deepEqual(
    orderedProduct?.variants.map((item) => [item.colour, item.size, item.stock]),
    [
      ["Black", "M", 7],
      ["Black", "S", 0],
      ["Navy Blue", "M", 2],
    ]
  );

  const verify = await call("/api/payments/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reference: savedOrder.paymentReference }),
  }, customerCookie);
  assert.equal(verify.data.verified, true);
  assert.equal(verify.data.orderNumber, createdOrderNumber);

  await call(`/api/admin/orders/${savedOrder.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "SHIPPED" }),
  });

  await call("/api/customer/auth/logout", { method: "POST" }, customerCookie);
  await call("/api/auth/logout", { method: "POST" });
  sessionCookie = "";
  const signedOutSession = await fetch(new URL("/api/auth/session", baseUrl), {
    cache: "no-store",
  });
  assert.equal(signedOutSession.status, 401);
  await assertAdminRedirect();

  sessionCookie = adminCookie;
  await call(`/api/admin/products/${createdProduct.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageUrl: null,
      imagePublicId: null,
      isActive: false,
      variants: [],
      removedVariantIds: createdProduct.variants.map((item) => item.id),
      colours: [],
    }),
  });
  console.log(
    `E2E passed. Sandbox order ${createdOrderNumber} preserved the Black / S variant and discounted price; test product ${createdProduct.id} was deactivated and its colour images were removed.`
  );
} catch (error) {
  console.error("E2E failed. No payment success is assumed:", error);
  if (createdProduct) {
    console.error(
      `Test product ${createdProduct.id} may need manual deactivation.`
    );
  }
  if (createdOrderNumber) {
    console.error(
      `Check order ${createdOrderNumber}; an unpaid reservation may need the configured cleanup scheduler.`
    );
  }
  process.exitCode = 1;
}
