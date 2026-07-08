import { randomUUID } from "crypto";

const ETORO_BASE = "https://public-api.etoro.com/api/v1";

// eToro assetTypeId / instrumentTypeID values the app can trade signals on.
// 5 = stocks, 6 = ETFs. Everything else (crypto, commodities, currencies) is skipped
// because the signal engine builds price history from Finnhub stock quotes.
export const IMPORTABLE_ASSET_TYPES = new Set([5, 6]);

export type EtoroWatchlistMarket = {
  id: string;
  symbolName: string;
  displayName: string;
  assetTypeId: number;
};

export type EtoroWatchlist = {
  watchlistId: string;
  name: string;
  // "Default" = the main user list, "Static" = user-created lists,
  // "RecentlyInvested" (and friends) = auto-generated — not worth importing.
  watchlistType: string;
  isDefault: boolean;
  totalItems: number;
  items: Array<{
    itemId: number;
    itemType: string;
    market?: EtoroWatchlistMarket | null;
  }>;
};

export type EtoroPosition = {
  positionID: number;
  instrumentID: number;
  isBuy: boolean;
  leverage: number;
  openRate: number;
  units: number;
  amount: number;
  initialAmountInDollars: number;
  openDateTime: string;
  unrealizedPnL?: {
    pnL: number;
    closeRate: number;
    timestamp: string;
  } | null;
};

export type EtoroPortfolio = {
  positions: EtoroPosition[];
  credit: number;
  unrealizedPnL: number;
};

export type EtoroInstrumentInfo = {
  symbol: string;
  name: string;
};

export type EtoroCandle = {
  fromDate: string; // ISO timestamp at UTC midnight of the trading day
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

async function etoroFetch<T>(path: string): Promise<T> {
  const apiKey = process.env.ETORO_API_KEY;
  const userKey = process.env.ETORO_USER_KEY;
  if (!apiKey || !userKey) {
    throw new Error("ETORO_API_KEY / ETORO_USER_KEY are not set");
  }

  const res = await fetch(`${ETORO_BASE}${path}`, {
    headers: {
      "x-request-id": randomUUID(),
      "x-api-key": apiKey,
      "x-user-key": userKey,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`eToro request ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function getWatchlists(): Promise<EtoroWatchlist[]> {
  const data = await etoroFetch<{ watchlists: EtoroWatchlist[] }>("/watchlists");
  return data.watchlists ?? [];
}

export async function getRealPortfolio(): Promise<EtoroPortfolio> {
  const data = await etoroFetch<{ clientPortfolio: EtoroPortfolio }>("/trading/info/real/pnl");
  return data.clientPortfolio;
}

// Daily OHLCV history, oldest -> newest. Serves up to 1000 candles (~4 years);
// non-trading days are simply absent. Shares the market-data quota of 120 req/min.
export async function getDailyCandles(
  instrumentId: number,
  count: number
): Promise<EtoroCandle[]> {
  const data = await etoroFetch<{
    candles: Array<{ instrumentId: number; candles: EtoroCandle[] | null }>;
  }>(`/market-data/instruments/${instrumentId}/history/candles/desc/OneDay/${count}`);

  const candles = data.candles?.[0]?.candles ?? [];
  return [...candles].reverse();
}

// Maps eToro numeric instrument IDs to ticker symbol + display name.
export async function getInstrumentInfo(
  instrumentIds: number[]
): Promise<Map<number, EtoroInstrumentInfo>> {
  const result = new Map<number, EtoroInstrumentInfo>();
  const unique = [...new Set(instrumentIds)];

  // The endpoint accepts at most 100 ids per request.
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const data = await etoroFetch<{
      instrumentDisplayDatas: Array<{
        instrumentID: number;
        instrumentDisplayName: string;
        symbolFull: string;
      }>;
    }>(`/market-data/instruments?instrumentIds=${chunk.join(",")}`);

    for (const inst of data.instrumentDisplayDatas ?? []) {
      result.set(inst.instrumentID, {
        symbol: inst.symbolFull,
        name: inst.instrumentDisplayName,
      });
    }
  }

  return result;
}
