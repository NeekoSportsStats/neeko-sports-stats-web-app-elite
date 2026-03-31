import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { Users, Building2, Brain, Target, ArrowLeft } from "lucide-react";

const NBAHub = () => {
  const navigate = useNavigate();

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <Button
        variant="ghost"
        onClick={() => navigate("/")}
        className="mb-4"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Button>
      <div>
        <h1 className="text-3xl md:text-4xl font-bold mb-2">Choose a stats category</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link to="/sports/nba/players">
          <Card className="p-6 hover:bg-muted/30 transition-all cursor-pointer group h-full">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold mb-2">NBA Player Stats</h2>
                <p className="text-muted-foreground">
                  Live player metrics, percentages, trends and round-by-round history. Includes Compact Mode toggle.
                </p>
              </div>
            </div>
          </Card>
        </Link>

        <Link to="/sports/nba/teams">
          <Card className="p-6 hover:bg-muted/30 transition-all cursor-pointer group h-full">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold mb-2">NBA Team Stats</h2>
                <p className="text-muted-foreground">
                  Aggregated team percentages, efficiency ratings and performance tracking.
                </p>
              </div>
            </div>
          </Card>
        </Link>

        <Link to="/sports/nba/ai-analysis">
          <Card className="p-6 hover:bg-muted/30 transition-all cursor-pointer group h-full">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <Brain className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold mb-2">NBA AI Analysis</h2>
                <p className="text-muted-foreground">
                  Free and Neeko+ insights with live trends, predictions and statistical anomalies.
                </p>
              </div>
            </div>
          </Card>
        </Link>

        <Link to="/sports/nba/match-centre">
          <Card className="p-6 hover:bg-muted/30 transition-all cursor-pointer group h-full">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <Target className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold mb-2">NBA Match Centre</h2>
                <p className="text-muted-foreground">
                  Upcoming games, matchups and predictions.
                </p>
              </div>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
};

export default NBAHub;
