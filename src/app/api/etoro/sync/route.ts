import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  getWatchlists,
  getRealPortfolio,
  getInstrumentInfo,
  IMPORTABLE_ASSET_TYPES,
  type EtoroWatchlistMarket,
} from "@/lib/etoro";

export const maxDuration = 60;

// Only user-curated lists; auto-generated ones ("RecentlyInvested" etc.) would flood
// the watchlist with 100 tickers the user never chose.
const IMPORTABLE_LIST_TYPES = new Set(["Default", "Static"]);

export async function POST() {
  if (!process.env.ETORO_API_KEY || !process.env.ETORO_USER_KEY) {
    return NextResponse.json(
      { error: "ETORO_API_KEY / ETORO_USER_KEY are not configured." },
      { status: 500 }
    );
  }

  try {
    // --- Watchlists → WatchlistItem ---
    const watchlists = await getWatchlists();
    const importable = watchlists.filter((w) => IMPORTABLE_LIST_TYPES.has(w.watchlistType));

    // Dedupe across lists (e.g. BP.L can be in both "My Watchlist" and "Energy"),
    // remembering every list a symbol came from for the notes field.
    const markets = new Map<string, { market: EtoroWatchlistMarket; lists: string[] }>();
    let skippedNonStock = 0;

    for (const list of importable) {
      for (const item of list.items ?? []) {
        const market = item.market;
        if (item.itemType !== "Instrument" || !market?.symbolName) continue;
        if (!IMPORTABLE_ASSET_TYPES.has(market.assetTypeId)) {
          skippedNonStock++;
          continue;
        }
        const symbol = market.symbolName.toUpperCase();
        const entry = markets.get(symbol);
        if (entry) {
          entry.lists.push(list.name);
        } else {
          markets.set(symbol, { market, lists: [list.name] });
        }
      }
    }

    let created = 0;
    let reactivated = 0;
    let unchanged = 0;

    for (const [symbol, { market, lists }] of markets) {
      // market.id is the eToro instrument ID; needed to pull candle history.
      const instrumentId = Number(market.id);
      const etoroInstrumentId = Number.isInteger(instrumentId) ? instrumentId : null;

      const existing = await prisma.watchlistItem.findUnique({ where: { symbol } });
      if (!existing) {
        await prisma.watchlistItem.create({
          data: {
            symbol,
            name: market.displayName || symbol,
            notes: `Imported from eToro (${lists.join(", ")})`,
            etoroInstrumentId,
          },
        });
        created++;
      } else if (!existing.active) {
        // Reactivate rather than duplicate so signal/trade history stays attached.
        await prisma.watchlistItem.update({
          where: { symbol },
          data: { active: true, etoroInstrumentId: etoroInstrumentId ?? existing.etoroInstrumentId },
        });
        reactivated++;
      } else {
        // Backfill the instrument ID on items imported before it was tracked.
        if (etoroInstrumentId !== null && existing.etoroInstrumentId !== etoroInstrumentId) {
          await prisma.watchlistItem.update({ where: { symbol }, data: { etoroInstrumentId } });
        }
        unchanged++;
      }
    }

    // --- Portfolio → EtoroPosition ---
    const portfolio = await getRealPortfolio();
    const positions = portfolio.positions ?? [];
    const instrumentInfo = await getInstrumentInfo(positions.map((p) => p.instrumentID));

    const syncedAt = new Date();
    const rows = positions.map((p) => {
      const info = instrumentInfo.get(p.instrumentID);
      return {
        positionId: String(p.positionID),
        instrumentId: p.instrumentID,
        symbol: info?.symbol ?? `#${p.instrumentID}`,
        name: info?.name ?? `Instrument ${p.instrumentID}`,
        isBuy: p.isBuy,
        leverage: p.leverage,
        openRate: p.openRate,
        units: p.units,
        investedUsd: p.initialAmountInDollars,
        currentRate: p.unrealizedPnL?.closeRate ?? null,
        unrealizedPnl: p.unrealizedPnL?.pnL ?? null,
        openedAt: new Date(p.openDateTime),
        syncedAt,
      };
    });

    await prisma.$transaction([
      prisma.etoroPosition.deleteMany(),
      prisma.etoroPosition.createMany({ data: rows }),
      prisma.etoroAccount.upsert({
        where: { id: 1 },
        create: { id: 1, credit: portfolio.credit, unrealizedPnl: portfolio.unrealizedPnL },
        update: { credit: portfolio.credit, unrealizedPnl: portfolio.unrealizedPnL },
      }),
    ]);

    return NextResponse.json({
      syncedAt: syncedAt.toISOString(),
      watchlist: {
        listsImported: importable.map((w) => w.name),
        created,
        reactivated,
        unchanged,
        skippedNonStock,
      },
      portfolio: {
        positions: rows.length,
        credit: portfolio.credit,
        unrealizedPnl: portfolio.unrealizedPnL,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
