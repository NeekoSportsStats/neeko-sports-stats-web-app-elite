import TeamMomentumPulse from "@/components/afl/teams/Section-4-trends/TeamMomentumPulse";
import { AFL_STAT_CONFIG } from "@/lib/stats/afl/statConfig";

export default function RoundMomentum() {
  return <TeamMomentumPulse statConfig={AFL_STAT_CONFIG} />;
}
