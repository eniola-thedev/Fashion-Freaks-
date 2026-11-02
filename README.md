# Fashion Freaks

Fashion Freaks is a Next.js App Router storefront backed by PostgreSQL and
Prisma. Product images remain URL-based in the database; new administrator
uploads are stored durably in Cloudinary.

## Local setup

Use Node.js 20.9 or newer. Install dependencies, copy `.env.example` to `.env`,
fill in the server-side settings, apply migrations, then start the app:

```powershell
npm install
npx prisma migrate deploy
npm run dev
```

`SESSION_SECRET` must be a unique random value of at least 32 characters.
Set `APP_URL` to the canonical public URL in production; production payment
callbacks require HTTPS and never derive their destination from a request
host.
Keep `.env` and production secrets out of source control.

## Product image uploads

The admin product editor uploads JPEG, PNG, and WebP files to the
`fashion-freaks/products` Cloudinary folder. The server checks the declared MIME
type and extension against the decoded image format, verifies it can decode the
image, enforces file-size and dimension/pixel limits, and normalizes it before
upload. The browser receives the secure URL and public ID only after Cloudinary
confirms a successful upload. The Cloudinary API secret is server-only.

Defaults are 8 MiB, 6000 px per dimension, and 25 million pixels. Set
`MAX_PRODUCT_IMAGE_BYTES` (up to 20 MiB), `MAX_PRODUCT_IMAGE_DIMENSION` (up to
10000 px), and `MAX_PRODUCT_IMAGE_PIXELS` (up to 100 million) to tune the
limits. Existing externally hosted `imageUrl` values remain supported. The
nullable `Product.imagePublicId` column is backward-compatible with existing
records. Replacements update PostgreSQL first and then remove the prior managed
Cloudinary asset; cleanup failures are logged and surfaced as an admin warning
without reverting a successful database update.

## Payment and reservation operations

Configure `PAYSTACK_SECRET_KEY` on the server. Use a Paystack `sk_test_` secret
for sandbox testing and an `sk_live_` secret only in production. Configure the
Paystack webhook URL as:

```text
https://YOUR_PUBLIC_HOST/api/webhooks/paystack
```

The webhook validates Paystack's SHA-512 HMAC over the original request body,
then checks transaction status, reference, amount, currency, and customer email
against the order before changing it to paid. The customer return page also
verifies transactions directly with Paystack; neither a browser redirect nor
client-supplied payment status marks an order paid.

Set `CRON_SECRET` to a separate, long random value. Configure the selected
hosting provider's HTTPS scheduler to call
`GET /api/cron/cleanup-orders` every five minutes with
`Authorization: Bearer <CRON_SECRET>`. The job checks expired reservations
against Paystack before releasing stock, and restores stock transactionally
only when payment is definitively failed or no payment attempt was started.
`needsReview` results require operator attention; do not release those
reservations manually until payment status is confirmed. The endpoint processes
up to 100 expired orders per request. Hosting providers differ in cron support
and maximum execution time, so confirm the chosen provider can schedule this
authenticated request and reach both PostgreSQL and Paystack.

## Delivery quotes

Checkout requests live rates from Shipbubble through the server-side
`/api/shipping/quote` route. Create a Shipbubble account, enable API access,
and begin with its `sb_sandbox` key. Configure `SHIPBUBBLE_API_KEY`,
`SHIPBUBBLE_SENDER_ADDRESS_CODE`, and `SHIPBUBBLE_FASHION_CATEGORY_ID` from
your account and the Shipbubble address/category APIs. Also configure
`SHIPBUBBLE_ITEM_WEIGHT_KG` and the three `SHIPBUBBLE_PACKAGE_*_CM` values to
match the actual garment and packed parcel dimensions. The current product
catalogue has no per-product weight/dimension fields, so the configured item
weight is applied uniformly; use a conservative measured estimate.
An API key alone is not enough to request rates: API access must be enabled in
the Shipbubble dashboard, and all six pickup/package settings must be present
in the server environment. Restart the server after changing local `.env`
settings; deployed environments must be updated in the host's secret manager.

The quote uses Shipbubble's validated destination address and the cheapest
available pickup rate returned for that route. Unsupported locations and
provider/configuration failures do not fall back to a made-up fee. Order
creation requests a fresh server-side quote and checks that its amount still
matches the customer's displayed quote before saving it in `Order.deliveryFee`
and adding it to the Paystack amount. Checkout offers a retry after temporary
quote failures and clearly identifies when Shipbubble account access is
unavailable. Shipment booking is not automatic: it
needs a post-payment fulfillment workflow with duplicate-booking protection.
Shipbubble's coverage varies by courier and location; a quote is the coverage
check for the entered address, not a claim that every address is serviceable.

See the [Shipbubble API guide](https://docs.shipbubble.com/get-started.md),
[authentication](https://docs.shipbubble.com/get-started/authentication.md),
[address validation](https://docs.shipbubble.com/api-reference/addresses/validate-address-global.md),
[package categories](https://docs.shipbubble.com/api-reference/package-categories.md),
and [rates](https://docs.shipbubble.com/api-reference/rates/request-shipping-rates.md).

## Validation and tests

```powershell
npm test
npm run lint
npm run build
npx prisma migrate status
```

The unit tests cover image decoding/limits and Paystack signature and order
matching. For read-only HTTP checks, start a built app with `npm start` in one
terminal and run `npm run test:smoke` in another. Set `SMOKE_BASE_URL` when the
server is not at `http://127.0.0.1:3000`.

`npm run test:e2e` exercises authenticated admin sessions, upload, create/edit,
storefront image persistence, order reservation, real Paystack sandbox
initialization, payment verification, signed webhook handling, fulfillment,
and logout. It requires `E2E_BASE_URL`, `E2E_ADMIN_EMAIL`,
`E2E_ADMIN_PASSWORD`, `E2E_IMAGE_PATH`, and `E2E_PAYSTACK_SECRET_KEY`. It also
requires explicit `E2E_CONFIRM_ISOLATED_DATABASE=YES` and
`E2E_CONFIRM_SANDBOX_PAYMENT=YES`; set `E2E_ALLOW_REMOTE_TARGET=YES` only for an
isolated remote staging target. The target must also have the Shipbubble
sandbox API key and verified pickup/package settings described above, and the
test address must receive an actual sandbox quote. The test creates a product
and real sandbox order. Run it only against a disposable non-production
database, Shipbubble sandbox account, and Paystack sandbox account. Complete
the hosted sandbox payment when prompted; the script only proceeds after
Paystack itself reports a successful transaction. On a successful run it
deactivates the test product and removes its Cloudinary image. A failure can
leave a test order/reservation, which the script reports for operator cleanup.

## Production deployment checklist

1. Select a Node.js host with HTTPS, persistent environment variables,
   PostgreSQL connectivity, outbound HTTPS to Cloudinary/Paystack, and a
   scheduled HTTP job. The production provider is not fixed by this project.
2. Set `DATABASE_URL`, `SESSION_SECRET`, `APP_URL`, `PAYSTACK_SECRET_KEY`,
   `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`,
   `CRON_SECRET`, and the Shipbubble settings described above in the host's
   secret manager. Keep all API secrets server-side.
3. Run `npx prisma migrate deploy` before serving traffic. This adds only the
   nullable product image identifier; it does not reset or rewrite existing
   product data.
4. Configure the Paystack webhook and the five-minute reservation cleanup
   schedule described above. Alert on scheduler failures and `needsReview`.
5. Run `npm test`, `npm run lint`, `npm run build`, and the gated sandbox E2E
   workflow against staging before enabling live payments.

Cloudinary, Shipbubble, and database/payment configuration must be tested with
the chosen production host before launch. A successful local build alone does
not verify these external integrations.
