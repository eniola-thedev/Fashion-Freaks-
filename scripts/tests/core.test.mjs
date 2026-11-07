import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import {
  matchesPaystackTransaction,
  parsePaystackTransaction,
  verifyPaystackSignature,
} from "../../src/lib/paystack.mjs";
import {
  ProductImageValidationError,
  validateProductImage,
} from "../../src/lib/product-image.mjs";
import {
  createProductImageProof,
  verifyProductImageProof,
} from "../../src/lib/product-image-proof.mjs";
import {
  buildProductGallerySlides,
  colourHexFromName,
  isValidProductImageUrl,
  parseProductColours,
  validateProductColourImageProofs,
} from "../../src/lib/product-colours.mjs";
import {
  hashAuthRateLimitKey,
  isValidCustomerPassword,
  isValidEmail,
  normalizeEmail,
  safeRedirectPath,
} from "../../src/lib/customer-auth.mjs";

const order = {
  paymentReference: "FF-test-reference",
  total: 12500,
  customerEmail: "buyer@example.com",
};

test("customer auth validation normalizes identity and blocks unsafe redirects", () => {
  assert.equal(normalizeEmail("  SHOPPER@Example.COM "), "shopper@example.com");
  assert.equal(isValidEmail("shopper@example.com"), true);
  assert.equal(isValidEmail("invalid"), false);
  assert.equal(isValidCustomerPassword("long-enough-password"), true);
  assert.equal(isValidCustomerPassword("short"), false);
  assert.equal(
    safeRedirectPath("/checkout?step=delivery"),
    "/checkout?step=delivery"
  );
  assert.equal(safeRedirectPath("//evil.example"), "/account");
  assert.equal(safeRedirectPath("https://evil.example"), "/account");
  assert.equal(
    hashAuthRateLimitKey("login", "SHOPPER@EXAMPLE.COM"),
    hashAuthRateLimitKey("login", "shopper@example.com")
  );
});

test("Paystack signature verification requires the exact HMAC", () => {
  const body = '{"event":"charge.success"}';
  const secret = "sandbox-test-secret";
  const signature = createHmac("sha512", secret)
    .update(body)
    .digest("hex");

  assert.equal(verifyPaystackSignature(body, signature, secret), true);
  assert.equal(verifyPaystackSignature(`${body} `, signature, secret), false);
  assert.equal(verifyPaystackSignature(body, "not-a-signature", secret), false);
  assert.equal(verifyPaystackSignature(body, null, secret), false);
});

test("Paystack transaction parsing and order matching validate all payment fields", () => {
  const transaction = parsePaystackTransaction({
    reference: order.paymentReference,
    status: "success",
    amount: 1_250_000,
    currency: "NGN",
    customer: { email: "BUYER@example.com" },
  });

  test("uploaded image proofs are time-limited and bound to the exact asset", () => {
    process.env.SESSION_SECRET = "test-session-secret-with-at-least-32-characters";
    const imageUrl =
      "https://res.cloudinary.com/test-cloud/image/upload/v1/fashion-freaks/products/test.jpg";
    const publicId = "fashion-freaks/products/test";
    const proof = createProductImageProof(imageUrl, publicId);

    assert.equal(verifyProductImageProof(proof, imageUrl, publicId), true);
    assert.equal(
      verifyProductImageProof(proof, `${imageUrl}?different=true`, publicId),
      false
    );
    assert.equal(verifyProductImageProof(proof, imageUrl, "other-asset"), false);
    assert.equal(verifyProductImageProof(`${proof}x`, imageUrl, publicId), false);
  });

  assert.ok(transaction);
  assert.equal(matchesPaystackTransaction(transaction, order), true);
  assert.equal(
    matchesPaystackTransaction(
      { ...transaction, amount: transaction.amount + 100 },
      order
    ),
    false
  );
  assert.equal(
    matchesPaystackTransaction(
      { ...transaction, reference: "another-reference" },
      order
    ),
    false
  );
  assert.equal(
    parsePaystackTransaction({
      reference: order.paymentReference,
      status: "success",
      amount: "1250000",
      currency: "NGN",
      customer: { email: order.customerEmail },
    }),
    null
  );
});

test("product colour metadata validates unique names, swatches and primary images", () => {
  const colours = parseProductColours([
    {
      name: "Black",
      hexColor: "#111111",
      images: [
        {
          imageUrl: "https://cdn.example.com/black-main.jpg",
          imagePublicId: null,
          isPrimary: true,
        },
        {
          imageUrl: "https://cdn.example.com/black-back.jpg",
          imagePublicId: null,
          isPrimary: false,
        },
      ],
    },
    {
      name: "Navy Blue",
      hexColor: "#14213d",
      images: [],
    },
  ]);

  assert.equal(colours?.length, 2);
  assert.equal(colours?.[0].images.length, 2);
  assert.equal(colours?.[1].hexColor, "#14213d");
  assert.equal(
    parseProductColours([
      { name: "Black", hexColor: "#000000", images: [] },
      { name: "black", hexColor: "#111111", images: [] },
    ]),
    null
  );
  assert.equal(
    parseProductColours([
      {
        name: "Grey",
        hexColor: "grey",
        images: [
          {
            imageUrl: "https://cdn.example.com/grey.jpg",
            imagePublicId: null,
            isPrimary: false,
          },
        ],
      },
    ]),
    null
  );
  assert.equal(colourHexFromName("Light Grey"), "#d3d3d3");
  assert.equal(colourHexFromName("Navy Blue"), "#14213d");
});

test("product gallery contains only valid uploaded images for their own colours", () => {
  const slides = buildProductGallerySlides(
    [
      {
        name: "Black",
        images: [
          {
            imageUrl: "https://cdn.example.com/black-1.jpg",
            position: 0,
            isPrimary: true,
          },
          {
            imageUrl: "https://cdn.example.com/black-2.jpg",
            position: 1,
            isPrimary: false,
          },
        ],
      },
      { name: "Brown", images: [] },
      {
        name: "Grey",
        images: [
          {
            imageUrl: "not-an-image-url",
            position: 0,
            isPrimary: true,
          },
          {
            imageUrl: "https://cdn.example.com/grey.jpg",
            position: 1,
            isPrimary: false,
          },
        ],
      },
    ],
    [
      {
        colour: "Brown",
        imageUrl: "https://cdn.example.com/brown.jpg",
      },
      {
        colour: "Navy Blue",
        imageUrl: "javascript:alert(1)",
      },
    ],
    "https://cdn.example.com/product.jpg"
  );

  assert.deepEqual(
    slides.map(({ imageUrl, colourName }) => [colourName, imageUrl]),
    [
      ["Black", "https://cdn.example.com/black-1.jpg"],
      ["Black", "https://cdn.example.com/black-2.jpg"],
      ["Brown", "https://cdn.example.com/brown.jpg"],
      ["Grey", "https://cdn.example.com/grey.jpg"],
    ]
  );
  assert.equal(isValidProductImageUrl("javascript:alert(1)"), false);
  assert.deepEqual(
    buildProductGallerySlides([], [], "https://cdn.example.com/product.jpg"),
    [{ imageUrl: "https://cdn.example.com/product.jpg", colourName: null }]
  );
  assert.deepEqual(buildProductGallerySlides([{ name: "Brown", images: [] }], [], null), []);
});

test("colour image proofs accept only verified uploads or unchanged saved assets", () => {
  const colour = {
    name: "Black",
    hexColor: "#111111",
    images: [
      {
        imageUrl: "https://res.cloudinary.com/test/image/upload/black.jpg",
        imagePublicId: "fashion-freaks/products/black",
        imageUploadProof: "valid-proof",
        isPrimary: true,
      },
    ],
  };
  const verifyProof = (proof, imageUrl, publicId) =>
    proof === "valid-proof" &&
    imageUrl.endsWith("/black.jpg") &&
    publicId === "fashion-freaks/products/black";
  const isCloudinaryAsset = (imageUrl, publicId) =>
    imageUrl.startsWith("https://res.cloudinary.com/") &&
    publicId.startsWith("fashion-freaks/products/");

  assert.equal(
    validateProductColourImageProofs(
      [colour],
      [],
      verifyProof,
      isCloudinaryAsset
    ),
    true
  );
  assert.equal(
    validateProductColourImageProofs(
      [{ ...colour, images: [{ ...colour.images[0], imageUploadProof: "bad" }] }],
      [],
      verifyProof,
      isCloudinaryAsset
    ),
    false
  );
  assert.equal(
    validateProductColourImageProofs(
      [{ ...colour, images: [{ ...colour.images[0], imageUploadProof: null }] }],
      [colour.images[0]],
      verifyProof,
      isCloudinaryAsset
    ),
    true
  );
});

test("product image validation accepts decoded JPEG, PNG and WebP files", async () => {
  for (const format of ["jpeg", "png", "webp"]) {
    const buffer = await sharp({
      create: {
        width: 128,
        height: 128,
        channels: 3,
        background: "#d8c8b0",
      },
    })
      .toFormat(format)
      .toBuffer();
    const mimeType = `image/${format === "jpeg" ? "jpeg" : format}`;
    const extension = format === "jpeg" ? "jpg" : format;

    const result = await validateProductImage(
      buffer,
      mimeType,
      `garment.${extension}`
    );
    assert.ok(result.buffer.length > 0);
    assert.equal(result.width, 128);
    assert.equal(result.height, 128);
  }
});

test("product image validation rejects mismatched, corrupt, oversized and huge images", async () => {
  const png = await sharp({
    create: {
      width: 128,
      height: 128,
      channels: 3,
      background: "#d8c8b0",
    },
  })
    .png()
    .toBuffer();

  await assert.rejects(
    validateProductImage(png, "image/jpeg", "garment.jpg"),
    ProductImageValidationError
  );
  await assert.rejects(
    validateProductImage(
      Buffer.from("not an image"),
      "image/png",
      "garment.png"
    ),
    ProductImageValidationError
  );
  await assert.rejects(
    validateProductImage(png, "image/png", "garment.svg"),
    ProductImageValidationError
  );
  await assert.rejects(
    validateProductImage(png, "image/png", "garment.png", {
      maxBytes: 16,
      maxDimension: 1000,
      maxPixels: 1_000_000,
    }),
    ProductImageValidationError
  );
  await assert.rejects(
    validateProductImage(png, "image/png", "garment.png", {
      maxBytes: 1_000_000,
      maxDimension: 100,
      maxPixels: 1_000_000,
    }),
    ProductImageValidationError
  );
});
