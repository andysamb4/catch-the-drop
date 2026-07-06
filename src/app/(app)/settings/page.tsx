import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoutButton } from "@/components/settings/logout-button";
import { SettingsForm } from "@/components/settings/settings-form";
import { CronTrigger } from "@/components/settings/cron-trigger";
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
        <CardContent className="space-y-4">
          <SettingsForm
            positionSizeUsd={settings?.positionSizeUsd ?? 500}
            maxOpenPositions={settings?.maxOpenPositions ?? 5}
            minSignalMovePct={settings?.minSignalMovePct ?? 3.0}
          />
          <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
            <span>kie.ai model</span>
            <span className={modelConfigured ? "text-primary" : "text-muted-foreground"}>
              {modelConfigured ? "Configured" : "Not set"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            The kie.ai model is set via the KIE_MODEL environment variable, not stored here.
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">Cron jobs</CardTitle>
        </CardHeader>
        <CardContent>
          <CronTrigger />
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
