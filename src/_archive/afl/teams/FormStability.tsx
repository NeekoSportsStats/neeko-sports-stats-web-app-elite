import TeamFormStabilityGrid from "@/components/afl/teams/Section-3-stability-analysis/TeamFormStabilityGrid";
import { AFL_STAT_CONFIG } from "@/lib/stats/afl/statConfig";

export default function FormStability() {
  return <TeamFormStabilityGrid statConfig={AFL_STAT_CONFIG} />;
}
