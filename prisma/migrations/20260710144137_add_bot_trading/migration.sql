-- CreateEnum
CREATE TYPE "BotPositionStatus" AS ENUM ('PENDING', 'OPEN', 'CLOSED', 'FAILED');

-- CreateTable
CREATE TABLE "BotPosition" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "instrumentId" INTEGER NOT NULL,
    "direction" "TradeDirection" NOT NULL,
    "status" "BotPositionStatus" NOT NULL DEFAULT 'PENDING',
    "orderId" TEXT,
    "positionId" TEXT,
    "requestedUsd" DOUBLE PRECISION NOT NULL,
    "entryPrice" DOUBLE PRECISION,
    "units" DOUBLE PRECISION,
    "takeProfitRate" DOUBLE PRECISION,
    "stopLossRate" DOUBLE PRECISION,
    "realizedPnl" DOUBLE PRECISION,
    "closeRate" DOUBLE PRECISION,
    "closeReason" TEXT,
    "error" TEXT,
    "signalId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filledAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotEvent" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "symbol" TEXT,
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BotPosition_positionId_key" ON "BotPosition"("positionId");

-- CreateIndex
CREATE INDEX "BotPosition_mode_status_idx" ON "BotPosition"("mode", "status");

-- CreateIndex
CREATE INDEX "BotEvent_mode_createdAt_idx" ON "BotEvent"("mode", "createdAt");

-- AddForeignKey
ALTER TABLE "BotPosition" ADD CONSTRAINT "BotPosition_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
