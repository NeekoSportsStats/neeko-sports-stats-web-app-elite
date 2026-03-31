import { useState } from "react";
import { FixtureCard } from "./FixtureCard";
import { FixtureDetailModal } from "./FixtureDetailModal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

interface Fixture {
  id: string;
  date_edst?: string;
  time_edst?: string;
  home_team: string;
  away_team: string;
  status?: string;
  result?: string;
  round?: string;
  venue?: string;
  game_id?: string;
  fixture_id?: string;
  season?: string;
  stage?: string;
  home_team_id?: string;
  home_team_name?: string;
  away_team_id?: string;
  away_team_name?: string;
}

interface FixturesListProps {
  fixtures: Fixture[];
  sport: string;
  loading?: boolean;
}

export const FixturesList = ({ fixtures, sport, loading }: FixturesListProps) => {
  const [selectedFixture, setSelectedFixture] = useState<Fixture | null>(null);

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-40 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  // Check if all fixtures are TBA or missing
  const allTBA = fixtures.length === 0 || fixtures.every(f => !f.date_edst || f.status?.toLowerCase() === 'tba');

  if (allTBA) {
    return (
      <Alert className="border-primary/20">
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>{sport.toUpperCase()} Match Center — To Be Announced</strong>
          <p className="text-sm mt-2">
            Official {sport.toUpperCase()} fixtures have not yet been released. Check back soon for updates.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  // Sort fixtures by date
  const sortedFixtures = [...fixtures].sort((a, b) => {
    if (!a.date_edst) return 1;
    if (!b.date_edst) return -1;
    return new Date(a.date_edst).getTime() - new Date(b.date_edst).getTime();
  });

  return (
    <>
      <div className="space-y-4">
        {sortedFixtures.map((fixture) => (
          <FixtureCard
            key={fixture.id}
            fixture={fixture}
            onClick={() => setSelectedFixture(fixture)}
          />
        ))}
      </div>

      {selectedFixture && (
        <FixtureDetailModal
          fixture={selectedFixture}
          sport={sport}
          open={!!selectedFixture}
          onClose={() => setSelectedFixture(null)}
        />
      )}
    </>
  );
};
