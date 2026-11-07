# Fashion Freaks

Fashion Freaks is a Next.js App Router storefront using Supabase for its
database API, authentication, and product image storage. Product image URLs
remain in the database; new administrator uploads are stored in Supabase
Storage.

## Local setup

Use Node.js 20.9 or newer. Create a Supabase project, copy `.env.example` to
`.env`, configure its URL and keys, then install dependencies and apply the SQL
migration. Install the Supabase CLI using its official Windows instructions.

```powershell
npm install
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
npm run dev
```

### Supabase database and authentication

Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` from the Supabase project settings. Runtime
database reads and writes use Supabase's Data API; no PostgreSQL connection
string is needed by the app. The service-role key is used only in server-side
code and bypasses RLS, so never expose it with a `NEXT_PUBLIC_` prefix or send
it to the browser.

The checked-in `supabase/migrations` SQL creates the application tables,
database triggers, and transactional RPCs. Link the CLI to the new, empty
Supabase project and run `supabase db push` to apply it. Do not apply this
initial schema migration to a database that already contains application
tables or data without first preparing a migration/backup plan.

The application uses Supabase Auth for both customers and administrators.
Enable email/password under Supabase Authentication. Signup supports Supabase's
email confirmation setting; disable confirmation if you want immediate signup
and checkout. Set the Supabase Site URL to `APP_URL` and allow
`APP_URL/auth/callback` in the redirect URL list. Supabase sends password reset
and confirmation messages; no separate Resend key is used.

The SQL migration creates a protected `UserProfile` table and a database
trigger that creates a CUSTOMER profile for every Supabase Auth user. RLS is
enabled and direct table access is revoked from Supabase's `anon` and
`authenticated` roles. Server routes validate the Supabase Auth session and
profile role before using the server-only service-role client. Admin signup is
not public.
Set `SUPABASE_SERVICE_ROLE_KEY` for server-side app operations and admin
provisioning. It must never be exposed to the browser or added with a
`NEXT_PUBLIC_` prefix.

As confirmed for this setup, the old database URL was a placeholder and there
is no old database data to import. If the old source database or its users
contain data after all, stop before applying the initial Supabase migration and
make a backup and data-transfer plan first.

After migration, create the first administrator:

```powershell
npm run create:admin
```

The script loads Supabase settings from the project-root `.env`, then prompts
for the administrator email and password in the terminal (the password is not
displayed). After it succeeds, start the app with `npm run dev` and sign in at
`http://localhost:3000/admin/login`. The dashboard is restricted to accounts
whose database profile has the `ADMIN` role.

This creates an email/password user in Supabase Auth and promotes its profile
to ADMIN through the server-side Supabase Data API. Customer account
registration always assigns CUSTOMER; client metadata cannot grant dashboard
access.

`SESSION_SECRET` remains required for signing administrator product-upload
proofs and must be a unique random value of at least 32 characters. Set
`APP_URL` to the canonical public URL in production; production payment
callbacks require HTTPS and never derive their destination from a request
host. Keep `.env` and production secrets out of source control.

Check database/product readiness at `/api/health`. `/api/products` returns an
uncached JSON array of active products; an empty array means the database is
connected but the catalogue is empty. Add products through the admin
dashboard. A missing or unreachable database returns a service-unavailable
response rather than looking like an empty catalogue.
Enabled size/colour variants remain orderable regardless of their recorded
stock quantities. Apply new SQL migrations with `supabase db push` before
deploying application changes.

## Product image uploads

Create a **public** Supabase Storage bucket named `product-images` (or set
`SUPABASE_PRODUCT_IMAGES_BUCKET` to a different bucket name). The bucket must
be public so storefront visitors can load product photos. Uploads and image
deletions use the server-only `SUPABASE_SERVICE_ROLE_KEY`; never expose it to
the browser. New images are stored under `fashion-freaks/products/`.

The admin product editor accepts JPEG, PNG, and WebP files. The server checks
the declared MIME type and extension against the decoded image format, verifies
it can decode the image, enforces file-size and dimension/pixel limits, and
normalizes it before upload. The browser receives the public URL and object ID
only after Supabase Storage confirms a successful upload.

Defaults are 8 MiB, 6000 px per dimension, and 25 million pixels. Set
`MAX_PRODUCT_IMAGE_BYTES` (up to 20 MiB), `MAX_PRODUCT_IMAGE_DIMENSION` (up to
10000 px), and `MAX_PRODUCT_IMAGE_PIXELS` (up to 100 million) to tune the
limits. Existing externally hosted `imageUrl` values remain supported. The
nullable `Product.imagePublicId` column is backward-compatible with existing
records. Existing external and Cloudinary image URLs continue to work. New
uploads use Supabase Storage; replacements update the database first and then
remove the prior managed image. Cloudinary credentials are only needed if old
Cloudinary uploads must be automatically deleted during replacement or product
cleanup. Cleanup failures are logged and surfaced as an admin warning without
reverting a successful database update.

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
against Paystack and cancels them only when payment is definitively failed or
no payment attempt was started.
`needsReview` results require operator attention; do not cancel those orders
until payment status is confirmed. The endpoint processes
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
If address validation fails, enter a specific street address and city.
If validation succeeds but no route is found, verify the sender address code
and confirm the destination is served by an enabled courier. The server log
records which Shipbubble endpoint rejected a request without logging the
recipient's address or contact details.

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
```

The unit tests cover image decoding/limits and Paystack signature and order
matching. For read-only HTTP checks, start a built app with `npm start` in one
terminal and run `npm run test:smoke` in another. Set `SMOKE_BASE_URL` when the
server is not at `http://127.0.0.1:3000`.

To validate migrations against a local Supabase database, start Docker and run
`supabase start`, followed by `supabase db lint --local`.

`npm run test:e2e` exercises authenticated admin sessions, upload, create/edit,
storefront image persistence, order reservation, real Paystack sandbox
initialization, payment verification, signed webhook handling, fulfillment,
and logout. It requires `E2E_BASE_URL`, `E2E_ADMIN_EMAIL`,
`E2E_ADMIN_PASSWORD`, `E2E_CUSTOMER_EMAIL`, `E2E_CUSTOMER_PASSWORD`,
`E2E_IMAGE_PATH`, and `E2E_PAYSTACK_SECRET_KEY`. The customer must already be
registered in Supabase Auth and able to sign in. It also requires explicit
`E2E_CONFIRM_ISOLATED_DATABASE=YES` and
`E2E_CONFIRM_SANDBOX_PAYMENT=YES`; set `E2E_ALLOW_REMOTE_TARGET=YES` only for an
isolated remote staging target. The target must also have the Shipbubble
sandbox API key and verified pickup/package settings described above, and the
test address must receive an actual sandbox quote. The test creates a product
and real sandbox order. Run it only against a disposable non-production
database, Shipbubble sandbox account, and Paystack sandbox account. Complete
the hosted sandbox payment when prompted; the script only proceeds after
Paystack itself reports a successful transaction. On a successful run it
deactivates the test product and removes its Supabase Storage image. A failure can
leave a test order/reservation, which the script reports for operator cleanup.

## Production deployment checklist

1. Select a Node.js host with HTTPS, persistent environment variables,
   outbound HTTPS to Supabase/Paystack, and a scheduled HTTP job.
   The production provider is not fixed by this project.
2. Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PRODUCT_IMAGES_BUCKET` (optional),
   `SESSION_SECRET`, `APP_URL`, `PAYSTACK_SECRET_KEY`, `CRON_SECRET`, and the Shipbubble settings
   described above in the host's secret manager. Keep service keys server-side.
   Configure Cloudinary credentials only when existing Cloudinary images need
   automatic cleanup.
3. Run `supabase db push` against the intended Supabase project before serving
   traffic.
4. Create the first admin using `npm run create:admin` against the migrated
   Supabase project. Configure the Paystack webhook and the five-minute reservation cleanup
   schedule described above. Alert on scheduler failures and `needsReview`.
5. Run `npm test`, `npm run lint`, `npm run build`, and the gated sandbox E2E
   workflow against staging before enabling live payments.

Supabase Storage, Shipbubble, and database/payment configuration must be tested with
the chosen production host before launch. A successful local build alone does
not verify these external integrations.
