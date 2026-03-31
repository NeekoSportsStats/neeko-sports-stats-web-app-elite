import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, ArrowLeft, Lock, Crown } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";

const MatchupAnalysis = () => {
  const { isPremium } = useAuth();
  const [teams, setTeams] = useState<string[]>([]);
  const [teamA, setTeamA] = useState<string>("");
  const [teamB, setTeamB] = useState<string>("");
  const [analysis, setAnalysis] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchTeams();
  }, []);

  const fetchTeams = async () => {
    try {
      const { data, error } = await supabase
        .from('afl_player_stats')
        .select('team')
        .order('team');

      if (error) throw error;

      if (data) {
        const teamNames = [...new Set(data.map((p: any) => p.team))].filter(Boolean);
        setTeams(teamNames.sort());
      }
    } catch (error) {
      console.error('Error fetching teams:', error);
    }
  };

  const generateAnalysis = async () => {
    if (!isPremium) {
      toast({
        title: "Neeko+ Required",
        description: "Upgrade to access AI-powered matchup analysis.",
        variant: "destructive",
      });
      return;
    }

    if (!teamA || !teamB) {
      toast({
        title: "Select Both Teams",
        description: "Please select both Team A and Team B.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setAnalysis("");

    try {
      const { data, error } = await supabase.functions.invoke('afl-ai-analysis', {
        body: {
          type: 'matchup',
          query: `Analyze the AFL matchup between ${teamA} vs ${teamB}. Provide insights on key advantages, strategic considerations, player matchups, and fantasy implications.`
        }
      });

      if (error) throw error;

      if (data?.error) {
        toast({
          title: "Analysis Error",
          description: data.error,
          variant: "destructive",
        });
        setAnalysis("");
        return;
      }

      setAnalysis(data.analysis || "No analysis available.");
    } catch (error) {
      console.error('Error generating analysis:', error);
      const errorMessage = error instanceof Error ? error.message : "Failed to generate analysis. Please try again.";
      toast({
        title: "Error",
        description: errorMessage.includes("AI service") 
          ? "The AI service is temporarily unavailable. Please try again in a few moments."
          : "Failed to generate analysis. Please try again.",
        variant: "destructive",
      });
      setAnalysis("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <Link to="/sports/afl/ai-analysis" className="inline-flex items-center text-primary hover:text-primary/80 mb-4">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to AI Analysis
      </Link>

      <div>
        <h1 className="text-3xl md:text-4xl font-bold mb-2 text-primary">Matchup Insights</h1>
        <p className="text-muted-foreground">
          Get AI-powered head-to-head analysis and strategic insights
        </p>
      </div>

      <div className="relative">
        <div className={!isPremium ? "blur-sm pointer-events-none" : ""}>
          <Card className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-4">
                <label className="text-sm font-medium">Team A</label>
                <Select value={teamA} onValueChange={setTeamA}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select Team A" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border max-h-[300px]">
                    {teams.map(team => (
                      <SelectItem key={team} value={team}>{team}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4">
                <label className="text-sm font-medium">Team B</label>
                <Select value={teamB} onValueChange={setTeamB}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select Team B" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border max-h-[300px]">
                    {teams.map(team => (
                      <SelectItem key={team} value={team}>{team}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button 
              onClick={generateAnalysis} 
              disabled={loading || !teamA || !teamB}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-lg py-6"
            >
              <Sparkles className="h-5 w-5 mr-2" />
              {loading ? "Analyzing..." : "Obtain Now!"}
            </Button>
          </Card>

          {analysis && (
            <Card className="overflow-hidden mt-6">
              <div className="bg-primary px-6 py-4">
                <h3 className="text-xl font-bold text-primary-foreground">AI Analysis Result</h3>
              </div>
              <div className="p-6">
                <div className="prose prose-invert max-w-none">
                  <div className="whitespace-pre-wrap leading-relaxed text-foreground">
                    {analysis}
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>

        {!isPremium && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-transparent via-background/60 to-background/95 pointer-events-auto">
            <Card className="max-w-md mx-4 p-8 text-center border-primary/50">
              <Lock className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="text-2xl font-bold mb-2">Unlock Matchup Analysis</h3>
              <p className="text-muted-foreground mb-6">
                Get AI-powered head-to-head comparisons and strategic matchup insights.
              </p>
              <Button asChild className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-lg py-6">
                <a href="https://www.neekostats.com.au/neeko-plus" target="_blank" rel="noopener noreferrer">
                  <Crown className="h-5 w-5 mr-2" />
                  Get Neeko+ — $5.99/week
                </a>
              </Button>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default MatchupAnalysis;
