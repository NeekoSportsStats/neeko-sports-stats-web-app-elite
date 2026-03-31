import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, MapPin } from "lucide-react";
import { format, parseISO } from "date-fns";

interface FixtureCardProps {
  fixture: {
    id: string;
    date_edst?: string;
    time_edst?: string;
    home_team: string;
    away_team: string;
    status?: string;
    result?: string;
    round?: string;
    venue?: string;
  };
  onClick?: () => void;
}

export const FixtureCard = ({ fixture, onClick }: FixtureCardProps) => {
  const isTBA = !fixture.date_edst || fixture.status?.toLowerCase() === 'tba';
  
  const getStatusBadge = () => {
    const status = fixture.status?.toLowerCase();
    if (isTBA) {
      return <Badge variant="secondary" className="bg-muted text-muted-foreground">To Be Announced</Badge>;
    }
    if (status === 'live') {
      return <Badge variant="default" className="bg-destructive text-destructive-foreground animate-pulse">Live</Badge>;
    }
    if (status === 'finished' || fixture.result) {
      return <Badge variant="secondary">Finished</Badge>;
    }
    if (status === 'postponed') {
      return <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-500">Postponed</Badge>;
    }
    return <Badge variant="outline">Scheduled</Badge>;
  };

  const formatDateTime = () => {
    if (!fixture.date_edst) return null;
    try {
      const date = parseISO(fixture.date_edst);
      return format(date, 'EEE, MMM d');
    } catch {
      return fixture.date_edst;
    }
  };

  const getScores = () => {
    if (!fixture.result) return { home: '—', away: '—' };
    const match = fixture.result.match(/(\d+)-(\d+)/);
    if (match) {
      return { home: match[1], away: match[2] };
    }
    return { home: '—', away: '—' };
  };

  const scores = getScores();

  return (
    <Card 
      className={`p-4 hover:shadow-md transition-shadow ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {fixture.round && (
              <span className="font-medium">{fixture.round}</span>
            )}
          </div>
          {getStatusBadge()}
        </div>

        {isTBA ? (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground">Fixture details to be announced</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
              <div className="text-right">
                <p className="font-semibold text-lg">{fixture.home_team}</p>
                <p className="text-2xl font-bold text-primary">{scores.home}</p>
              </div>
              
              <div className="text-muted-foreground text-sm font-medium">vs</div>
              
              <div className="text-left">
                <p className="font-semibold text-lg">{fixture.away_team}</p>
                <p className="text-2xl font-bold text-primary">{scores.away}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground pt-2 border-t">
              {fixture.date_edst && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>{formatDateTime()}</span>
                </div>
              )}
              {fixture.time_edst && (
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  <span>{fixture.time_edst} EDST</span>
                </div>
              )}
              {fixture.venue && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  <span>{fixture.venue}</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  );
};
