-- Add a nullable unique key so existing orders remain unchanged.
ALTER TABLE "Order" ADD COLUMN "checkoutKey" TEXT;

CREATE UNIQUE INDEX "Order_checkoutKey_key" ON "Order"("checkoutKey");
