ALTER TABLE "Product" ADD COLUMN "imagePublicId" TEXT;
CREATE UNIQUE INDEX "Product_imagePublicId_key" ON "Product"("imagePublicId");
