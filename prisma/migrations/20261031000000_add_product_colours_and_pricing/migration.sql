-- CreateTable
CREATE TABLE "ProductColour" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hexColor" TEXT NOT NULL DEFAULT '#808080',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductColour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductColourImage" (
    "id" TEXT NOT NULL,
    "colourId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imagePublicId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductColourImage_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "discountPrice" INTEGER,
ADD COLUMN "isFeatured" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "ProductColour_productId_name_key" ON "ProductColour"("productId", "name");

-- CreateIndex
CREATE INDEX "ProductColour_productId_sortOrder_idx" ON "ProductColour"("productId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ProductColourImage_imagePublicId_key" ON "ProductColourImage"("imagePublicId");

-- CreateIndex
CREATE INDEX "ProductColourImage_colourId_position_idx" ON "ProductColourImage"("colourId", "position");

-- AddForeignKey
ALTER TABLE "ProductColour" ADD CONSTRAINT "ProductColour_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductColourImage" ADD CONSTRAINT "ProductColourImage_colourId_fkey" FOREIGN KEY ("colourId") REFERENCES "ProductColour"("id") ON DELETE CASCADE ON UPDATE CASCADE;
