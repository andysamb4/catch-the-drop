-- Strategy label for the champion/challenger split. Additive and defaulted so
-- every existing WatchlistItem/Signal/BotPosition reads back as "core" and the
-- live single-stock bot is unaffected. "etf-mr" tags the ETF mean-reversion
-- challenger.

-- AlterTable
ALTER TABLE "WatchlistItem" ADD COLUMN     "strategy" TEXT NOT NULL DEFAULT 'core';

-- AlterTable
ALTER TABLE "Signal" ADD COLUMN     "strategy" TEXT NOT NULL DEFAULT 'core';

-- AlterTable
ALTER TABLE "BotPosition" ADD COLUMN     "strategy" TEXT NOT NULL DEFAULT 'core';
