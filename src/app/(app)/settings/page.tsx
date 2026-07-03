import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoutButton } from "@/components/settings/logout-button";

const UPCOMING_SETTINGS = [
  { label: "Position size per signal", detail: "Default $500, Phase 2" },
  { label: "Max open positions", detail: "Default 5, Phase 2" },
  { label: "Min signal move to fire", detail: "Default 3%, Phase 3" },
  { label: "kie.ai model (KIE_MODEL)", detail: "Phase 5" },
];

export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">Coming soon</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {UPCOMING_SETTINGS.map((item) => (
            <div key={item.label} className="flex items-center justify-between text-sm">
              <span>{item.label}</span>
              <span className="text-muted-foreground">{item.detail}</span>
            </div>
          ))}
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
