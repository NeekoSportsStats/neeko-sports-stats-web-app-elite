import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Users, Shield, Brain } from "lucide-react";

const Dashboard = () => {
  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-bold mb-3">AFL</h1>
        <h3 className="text-xl text-muted-foreground">Choose a stats category</h3>
      </div>

      {/* Navigation Cards */}
      <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        <Link to="/sports/afl/players">
          <Card className="p-8 text-center hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/10 cursor-pointer group">
            <Users className="h-16 w-16 text-primary mx-auto mb-4 group-hover:scale-110 transition-transform" />
            <h3 className="text-2xl font-bold mb-2">AFL Player Stats</h3>
            <p className="text-muted-foreground">
              Live player metrics, trends & insights
            </p>
          </Card>
        </Link>

        <Link to="/sports/afl/teams">
          <Card className="p-8 text-center hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/10 cursor-pointer group">
            <Shield className="h-16 w-16 text-primary mx-auto mb-4 group-hover:scale-110 transition-transform" />
            <h3 className="text-2xl font-bold mb-2">AFL Team Stats</h3>
            <p className="text-muted-foreground">
              Aggregated team performance data
            </p>
          </Card>
        </Link>

        <Link to="/sports/afl/ai-analysis">
          <Card className="p-8 text-center hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/10 cursor-pointer group">
            <Brain className="h-16 w-16 text-primary mx-auto mb-4 group-hover:scale-110 transition-transform" />
            <h3 className="text-2xl font-bold mb-2">AFL AI Analysis</h3>
            <p className="text-muted-foreground">
              Top trends, breakouts & predictive analysis
            </p>
          </Card>
        </Link>
      </div>
    </div>
  );
};

export default Dashboard;
