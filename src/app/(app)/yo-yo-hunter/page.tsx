import { Sparkles } from "lucide-react";
import { ComingSoon } from "@/components/layout/coming-soon";

export default function YoYoHunterPage() {
  return (
    <ComingSoon
      icon={Sparkles}
      title="Yo-Yo Hunter coming in Phase 5"
      description="Pick a ticker and get an AI verdict on whether its oscillation pattern fits the strategy."
    />
  );
}
