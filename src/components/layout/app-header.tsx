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
  const today = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <header className="sticky top-0 z-40 bg-foreground text-background pt-safe-nav">
      <div className="mx-auto flex max-w-lg items-end justify-between px-4 pb-3">
        <div>
          {/* Primary is tuned for light surfaces; lift its lightness on the dark header for contrast. */}
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[oklch(0.68_0.1_178)]">
            Catch the Drop
          </p>
          <h1 className="text-lg font-bold tracking-tight">{title}</h1>
        </div>
        <span suppressHydrationWarning className="pb-0.5 text-xs text-background/60">
          {today}
        </span>
      </div>
    </header>
  );
}
