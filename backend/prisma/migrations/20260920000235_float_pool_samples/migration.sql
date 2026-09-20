-- CreateTable
CREATE TABLE "PoolSample" (
    "id" BIGSERIAL NOT NULL,
    "pool" TEXT NOT NULL,
    "sharePrice" BIGINT NOT NULL,
    "totalAssets" BIGINT NOT NULL,
    "totalDebt" BIGINT NOT NULL,
    "totalShares" BIGINT NOT NULL,
    "price" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PoolSample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PoolSample_pool_createdAt_idx" ON "PoolSample"("pool", "createdAt");
