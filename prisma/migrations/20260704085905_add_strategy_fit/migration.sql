-- CreateEnum
CREATE TYPE "StrategyFit" AS ENUM ('GOOD', 'MODERATE', 'POOR');

-- AlterTable
ALTER TABLE "WatchlistItem" ADD COLUMN     "strategyFit" "StrategyFit",
ADD COLUMN     "strategyFitManual" BOOLEAN NOT NULL DEFAULT false;
