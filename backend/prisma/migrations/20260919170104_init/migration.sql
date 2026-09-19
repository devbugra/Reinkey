-- CreateTable
CREATE TABLE "Channel" (
    "id" BIGINT NOT NULL,
    "payer" TEXT NOT NULL,
    "payee" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "deposit" BIGINT NOT NULL,
    "claimed" BIGINT NOT NULL,
    "lastAccepted" BIGINT NOT NULL DEFAULT 0,
    "lastSig" TEXT,
    "voucherKey" TEXT NOT NULL,
    "expiryLedger" INTEGER NOT NULL,
    "open" BOOLEAN NOT NULL,
    "vouchersSinceClaim" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" BIGSERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "channelId" BIGINT,
    "account" TEXT,
    "code" TEXT,
    "tx" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Event_type_createdAt_idx" ON "Event"("type", "createdAt");

-- CreateIndex
CREATE INDEX "Event_account_idx" ON "Event"("account");

-- CreateIndex
CREATE INDEX "Event_channelId_idx" ON "Event"("channelId");
