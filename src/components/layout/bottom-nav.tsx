"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutList, Receipt, BarChart3, Settings, Zap, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Zap },
  { href: "/watchlist", label: "Watchlist", icon: LayoutList },
  { href: "/signals", label: "Signals", icon: TrendingUp },
  { href: "/trades", label: "Trades", icon: Receipt },
  { href: "/performance", label: "Performance", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 pb-safe-nav backdrop-blur supports-backdrop-filter:bg-background/80">
      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-2 pt-1.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-medium transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
