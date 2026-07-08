-- CreateTable
CREATE TABLE "EtoroPosition" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "instrumentId" INTEGER NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isBuy" BOOLEAN NOT NULL,
    "leverage" DOUBLE PRECISION NOT NULL,
    "openRate" DOUBLE PRECISION NOT NULL,
    "units" DOUBLE PRECISION NOT NULL,
    "investedUsd" DOUBLE PRECISION NOT NULL,
    "currentRate" DOUBLE PRECISION,
    "unrealizedPnl" DOUBLE PRECISION,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EtoroPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EtoroAccount" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "credit" DOUBLE PRECISION NOT NULL,
    "unrealizedPnl" DOUBLE PRECISION NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EtoroAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EtoroPosition_positionId_key" ON "EtoroPosition"("positionId");
