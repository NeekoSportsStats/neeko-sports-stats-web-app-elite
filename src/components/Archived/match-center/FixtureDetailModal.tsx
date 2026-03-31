import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, MapPin, Trophy } from "lucide-react";
import { format, parseISO } from "date-fns";

interface FixtureDetailModalProps {
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
    season?: string;
    stage?: string;
    home_team_name?: string;
    away_team_name?: string;
  };
  sport: string;
  open: boolean;
  onClose: () => void;
}

export const FixtureDetailModal = ({ fixture, sport, open, onClose }: FixtureDetailModalProps) => {
  const homeTeam = fixture.home_team_name || fixture.home_team;
  const awayTeam = fixture.away_team_name || fixture.away_team;
  
  const getScores = () => {
    if (!fixture.result) return { home: '—', away: '—' };
    const match = fixture.result.match(/(\d+)-(\d+)/);
    if (match) {
      return { home: match[1], away: match[2] };
    }
    return { home: '—', away: '—' };
  };

  const scores = getScores();

  const formatDateTime = () => {
    if (!fixture.date_edst) return 'TBA';
    try {
      const date = parseISO(fixture.date_edst);
      return format(date, 'EEEE, MMMM d, yyyy');
    } catch {
      return fixture.date_edst;
    }
  };

  const getStatusBadge = () => {
    const status = fixture.status?.toLowerCase();
    if (!fixture.date_edst || status === 'tba') {
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

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{sport.toUpperCase()} Match Details</DialogTitle>
            {getStatusBadge()}
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {fixture.round && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Trophy className="h-4 w-4" />
              <span>{fixture.round}</span>
              {fixture.season && <span>• {fixture.season}</span>}
              {fixture.stage && <span>• {fixture.stage}</span>}
            </div>
          )}

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6 py-6">
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-bold">{homeTeam}</h3>
              <p className="text-4xl font-bold text-primary">{scores.home}</p>
              <p className="text-sm text-muted-foreground">Home</p>
            </div>
            
            <div className="text-muted-foreground text-lg font-semibold">vs</div>
            
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-bold">{awayTeam}</h3>
              <p className="text-4xl font-bold text-primary">{scores.away}</p>
              <p className="text-sm text-muted-foreground">Away</p>
            </div>
          </div>

          <div className="space-y-3 pt-6 border-t">
            <div className="flex items-center gap-3 text-sm">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Date</p>
                <p className="text-muted-foreground">{formatDateTime()}</p>
              </div>
            </div>

            {fixture.time_edst && (
              <div className="flex items-center gap-3 text-sm">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Time</p>
                  <p className="text-muted-foreground">{fixture.time_edst} EDST</p>
                </div>
              </div>
            )}

            {fixture.venue && (
              <div className="flex items-center gap-3 text-sm">
                <MapPin className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Venue</p>
                  <p className="text-muted-foreground">{fixture.venue}</p>
                </div>
              </div>
            )}
          </div>

          {fixture.result && (
            <div className="bg-muted/50 p-4 rounded-lg">
              <p className="text-sm font-medium mb-1">Result</p>
              <p className="text-lg">{fixture.result}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
