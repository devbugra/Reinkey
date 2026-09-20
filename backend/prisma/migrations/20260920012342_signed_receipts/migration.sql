-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "channelId" BIGINT NOT NULL,
    "payer" TEXT NOT NULL,
    "payee" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "cumulative" BIGINT NOT NULL,
    "requestHash" TEXT,
    "responseHash" TEXT,
    "attestedAt" TIMESTAMP(3),
    "signer" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Receipt_payee_createdAt_idx" ON "Receipt"("payee", "createdAt");

-- CreateIndex
CREATE INDEX "Receipt_channelId_idx" ON "Receipt"("channelId");
