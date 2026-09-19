-- CreateTable
CREATE TABLE "Resource" (
    "url" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'GET',
    "payTo" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "price" BIGINT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "accepts" JSONB NOT NULL,
    "metadata" JSONB NOT NULL,
    "payments" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastPaidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("url")
);

-- CreateIndex
CREATE INDEX "Resource_payTo_idx" ON "Resource"("payTo");
