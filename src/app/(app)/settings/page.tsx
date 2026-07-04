import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoutButton } from "@/components/settings/logout-button";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const modelConfigured = !!process.env.KIE_MODEL && !process.env.KIE_MODEL.startsWith("REPLACE_WITH_");

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">Tools</CardTitle>
        </CardHeader>
        <CardContent>
          <Link
            href="/yo-yo-hunter"
            className="flex items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm font-medium hover:bg-muted"
          >
            <Sparkles className="h-4 w-4 text-primary" />
            Yo-Yo Hunter
          </Link>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">Strategy settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span>Position size per signal</span>
            <span className="text-muted-foreground">${settings?.positionSizeUsd ?? 500}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Max open positions</span>
            <span className="text-muted-foreground">{settings?.maxOpenPositions ?? 5}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Min signal move to fire</span>
            <span className="text-muted-foreground">{settings?.minSignalMovePct ?? 3}%</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>kie.ai model</span>
            <span className={modelConfigured ? "text-primary" : "text-muted-foreground"}>
              {modelConfigured ? "Configured" : "Not set"}
            </span>
          </div>
          <p className="pt-1 text-xs text-muted-foreground">
            Editing these in-app is coming soon — for now they&apos;re set via defaults in the database.
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">Session</CardTitle>
        </CardHeader>
        <CardContent>
          <LogoutButton />
        </CardContent>
      </Card>
    </div>
  );
}
