import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoutButton } from "@/components/settings/logout-button";
import { SettingsForm } from "@/components/settings/settings-form";
import { CronTrigger } from "@/components/settings/cron-trigger";
import { EtoroSync } from "@/components/settings/etoro-sync";
import { prisma } from "@/lib/db";
import { modelChain } from "@/lib/ai/client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const [aiModel, ...fallbackModels] = modelChain();
  const etoroConfigured = !!process.env.ETORO_API_KEY && !!process.env.ETORO_USER_KEY;

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
            <span className={aiModel ? "text-primary" : "text-muted-foreground"}>
              {aiModel ?? "Not set"}
            </span>
          </div>
          {fallbackModels.length > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Fallback</span>
              <span className="text-muted-foreground">{fallbackModels.join(" → ")}</span>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            The fallback runs whenever the model above errors, refuses, or answers empty. The
            chain lives in the code (src/lib/ai/client.ts); KIE_MODEL_CHAIN overrides it.
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
          <CardTitle className="text-base">eToro</CardTitle>
        </CardHeader>
        <CardContent>
          <EtoroSync configured={etoroConfigured} />
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
