import { prisma } from "@/lib/db";
import { getAllTrades } from "@/lib/trade-dto";
import { PerformanceDashboard } from "@/components/performance/performance-dashboard";
import { BacktestDashboard } from "@/components/performance/backtest-dashboard";
import { EtoroPositions } from "@/components/performance/etoro-positions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BacktestTickerInput } from "@/lib/backtest";

export const dynamic = "force-dynamic";

export default async function PerformancePage() {
  const [trades, watchlistItems, priceBars, settings, etoroAccount, etoroPositions] =
    await Promise.all([
      getAllTrades(),
      prisma.watchlistItem.findMany({ where: { active: true }, orderBy: { symbol: "asc" } }),
      prisma.priceBar.findMany({
        where: { watchlistItem: { active: true } },
        orderBy: { date: "asc" },
      }),
      prisma.settings.findUnique({ where: { id: 1 } }),
      prisma.etoroAccount.findUnique({ where: { id: 1 } }),
      prisma.etoroPosition.findMany(),
    ]);

  const barsBySymbol = new Map<string, BacktestTickerInput["bars"]>();
  for (const bar of priceBars) {
    const list = barsBySymbol.get(bar.symbol) ?? [];
    list.push({ date: bar.date.toISOString(), close: bar.close });
    barsBySymbol.set(bar.symbol, list);
  }

  const backtestTickers: BacktestTickerInput[] = watchlistItems.map((item) => ({
    symbol: item.symbol,
    name: item.name,
    sector: item.sector,
    bars: barsBySymbol.get(item.symbol) ?? [],
  }));

  return (
    <Tabs defaultValue="live">
      <TabsList className="mb-4 w-full">
        <TabsTrigger value="live">Live</TabsTrigger>
        <TabsTrigger value="backtest">Backtest</TabsTrigger>
        <TabsTrigger value="etoro">eToro</TabsTrigger>
      </TabsList>
      <TabsContent value="live">
        <PerformanceDashboard trades={trades} />
      </TabsContent>
      <TabsContent value="backtest">
        <BacktestDashboard
          tickers={backtestTickers}
          minSignalMovePct={settings?.minSignalMovePct ?? 3.0}
          positionSizeUsd={settings?.positionSizeUsd ?? 500}
        />
      </TabsContent>
      <TabsContent value="etoro">
        <EtoroPositions
          account={
            etoroAccount
              ? {
                  credit: etoroAccount.credit,
                  unrealizedPnl: etoroAccount.unrealizedPnl,
                  syncedAt: etoroAccount.syncedAt.toISOString(),
                }
              : null
          }
          positions={etoroPositions.map((p) => ({
            id: p.id,
            symbol: p.symbol,
            name: p.name,
            isBuy: p.isBuy,
            leverage: p.leverage,
            investedUsd: p.investedUsd,
            unrealizedPnl: p.unrealizedPnl,
          }))}
        />
      </TabsContent>
    </Tabs>
  );
}
