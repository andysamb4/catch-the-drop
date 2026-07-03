"use client";

import { usePathname } from "next/navigation";

const TITLES: Array<[prefix: string, title: string]> = [
  ["/watchlist", "Watchlist"],
  ["/trades", "Trades"],
  ["/performance", "Performance"],
  ["/yo-yo-hunter", "Yo-Yo Hunter"],
  ["/settings", "Settings"],
  ["/signals", "Signal History"],
  ["/", "3-Day Drop & Climb"],
];

function titleForPath(pathname: string) {
  return TITLES.find(([prefix]) => pathname === "/" ? pathname === prefix : pathname.startsWith(prefix))?.[1] ?? "3-Day Drop & Climb";
}

export function AppHeader() {
  const pathname = usePathname();
  const title = titleForPath(pathname);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 pt-safe-nav backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex h-14 max-w-lg items-center px-4">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      </div>
    </header>
  );
}
