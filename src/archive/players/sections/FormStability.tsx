import FormStabilityGrid from "@/components/afl/players/Section-3-stability-analysis/FormStabilityGrid";
import { AFL_STAT_CONFIG } from "@/lib/stats/afl/statConfig";

export default function FormStability() {
  return <FormStabilityGrid statConfig={AFL_STAT_CONFIG} />;
}
