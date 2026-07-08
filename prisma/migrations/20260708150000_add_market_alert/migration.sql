-- CreateTable
CREATE TABLE "MarketAlert" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "headline" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "vix" DOUBLE PRECISION,
    "vixChangePct" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketAlert_date_key" ON "MarketAlert"("date");
