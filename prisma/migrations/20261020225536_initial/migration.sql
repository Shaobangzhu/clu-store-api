-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "CartStatus" AS ENUM ('ACTIVE');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('CNY');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "subTitle" TEXT,
    "videos" JSONB,
    "editorialFeatures" JSONB,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "categoryId" INTEGER,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "imageSrc" TEXT NOT NULL,
    "carouselImages" JSONB NOT NULL,
    "startingPrice" DECIMAL(12,2) NOT NULL,
    "installments" DECIMAL(12,2),
    "features" JSONB NOT NULL,
    "inStock" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductModel" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "specification" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "inStock" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProductModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductMemorySize" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "extraPrice" DECIMAL(12,2) NOT NULL,
    "inStock" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProductMemorySize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductColor" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "inStock" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProductColor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "imageSrc" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "active" BOOLEAN NOT NULL DEFAULT false,
    "soldOut" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewArrival" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER,
    "displayOrder" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "imageSrc" TEXT NOT NULL,
    "textColor" TEXT NOT NULL,
    "soldOut" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "NewArrival_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportInformation" (
    "key" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SupportInformation_pkey" PRIMARY KEY ("key","locale")
);

-- CreateTable
CREATE TABLE "Cart" (
    "id" SERIAL NOT NULL,
    "userId" UUID NOT NULL,
    "status" "CartStatus" NOT NULL DEFAULT 'ACTIVE',
    "currency" "Currency" NOT NULL DEFAULT 'CNY',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" SERIAL NOT NULL,
    "cartId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "modelId" INTEGER NOT NULL,
    "memorySizeId" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" SERIAL NOT NULL,
    "userId" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'pending',
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'CNY',
    "idempotencyKey" VARCHAR(128),
    "requestFingerprint" VARCHAR(64),
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "productId" INTEGER,
    "productName" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "modelSpecification" TEXT NOT NULL,
    "memoryName" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusHistory" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "operatorId" UUID NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Category_title_key" ON "Category"("title");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");

-- CreateIndex
CREATE INDEX "Product_createdAt_id_idx" ON "Product"("createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProductModel_productId_id_key" ON "ProductModel"("productId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProductMemorySize_productId_id_key" ON "ProductMemorySize"("productId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProductColor_productId_name_key" ON "ProductColor"("productId", "name");

-- CreateIndex
CREATE INDEX "Offer_productId_idx" ON "Offer"("productId");

-- CreateIndex
CREATE INDEX "Offer_active_startsAt_endsAt_idx" ON "Offer"("active", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "NewArrival_productId_idx" ON "NewArrival"("productId");

-- CreateIndex
CREATE INDEX "NewArrival_displayOrder_id_idx" ON "NewArrival"("displayOrder", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_userId_key" ON "Cart"("userId");

-- CreateIndex
CREATE INDEX "CartItem_productId_modelId_idx" ON "CartItem"("productId", "modelId");

-- CreateIndex
CREATE INDEX "CartItem_productId_memorySizeId_idx" ON "CartItem"("productId", "memorySizeId");

-- CreateIndex
CREATE INDEX "CartItem_productId_color_idx" ON "CartItem"("productId", "color");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_productId_modelId_memorySizeId_color_key" ON "CartItem"("cartId", "productId", "modelId", "memorySizeId", "color");

-- CreateIndex
CREATE INDEX "Order_userId_createdAt_id_idx" ON "Order"("userId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_userId_idempotencyKey_key" ON "Order"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_orderId_createdAt_id_idx" ON "OrderStatusHistory"("orderId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_operatorId_idx" ON "OrderStatusHistory"("operatorId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductModel" ADD CONSTRAINT "ProductModel_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMemorySize" ADD CONSTRAINT "ProductMemorySize_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductColor" ADD CONSTRAINT "ProductColor_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewArrival" ADD CONSTRAINT "NewArrival_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_productId_modelId_fkey" FOREIGN KEY ("productId", "modelId") REFERENCES "ProductModel"("productId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_productId_memorySizeId_fkey" FOREIGN KEY ("productId", "memorySizeId") REFERENCES "ProductMemorySize"("productId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_productId_color_fkey" FOREIGN KEY ("productId", "color") REFERENCES "ProductColor"("productId", "name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reviewed invariants not expressed by Prisma schema syntax.
CREATE UNIQUE INDEX "User_username_normalized_key" ON "User" (lower(btrim("username")));
CREATE UNIQUE INDEX "User_email_normalized_key" ON "User" (lower(btrim("email")));
ALTER TABLE "User" ADD CONSTRAINT "User_identity_nonempty" CHECK (length(btrim("username")) > 0 AND length(btrim("email")) > 0);
ALTER TABLE "Category" ADD CONSTRAINT "Category_positive_id" CHECK ("id" > 0);
ALTER TABLE "Product" ADD CONSTRAINT "Product_positive_id" CHECK ("id" > 0);
ALTER TABLE "Product" ADD CONSTRAINT "Product_nonnegative_money" CHECK ("startingPrice" >= 0 AND ("installments" IS NULL OR "installments" >= 0));
ALTER TABLE "ProductModel" ADD CONSTRAINT "ProductModel_valid_price_id" CHECK ("id" > 0 AND "price" >= 0);
ALTER TABLE "ProductMemorySize" ADD CONSTRAINT "ProductMemorySize_valid_price_id" CHECK ("id" > 0 AND "extraPrice" >= 0);
ALTER TABLE "ProductColor" ADD CONSTRAINT "ProductColor_positive_id" CHECK ("id" > 0);
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_valid_amounts" CHECK ("quantity" > 0 AND "unitPrice" >= 0);
ALTER TABLE "Order" ADD CONSTRAINT "Order_nonnegative_total" CHECK ("totalAmount" >= 0);
ALTER TABLE "Order" ADD CONSTRAINT "Order_idempotency_pair" CHECK (("idempotencyKey" IS NULL) = ("requestFingerprint" IS NULL));
ALTER TABLE "Order" ADD CONSTRAINT "Order_idempotency_format" CHECK (
  ("idempotencyKey" IS NULL OR "idempotencyKey" ~ '^[ -~]{1,128}$') AND
  ("requestFingerprint" IS NULL OR "requestFingerprint" ~ '^[0-9a-f]{64}$')
);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_valid_amounts" CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "lineTotal" = "unitPrice" * "quantity");
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_date_order" CHECK ("startsAt" IS NULL OR "endsAt" IS NULL OR "endsAt" >= "startsAt");
-- Shape only: atomic updates, current-state checks and ADMIN authorization are P08 service responsibilities.
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_valid_edge" CHECK (
  ("fromStatus" IS NULL AND "toStatus" = 'pending') OR
  ("fromStatus" IS NOT NULL AND "fromStatus" = 'pending' AND "toStatus" IN ('approved', 'rejected'))
);
