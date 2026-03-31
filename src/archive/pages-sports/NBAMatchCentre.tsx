import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { FixturesList } from "@/components/Archived/match-center/FixturesList";
import { useToast } from "@/hooks/use-toast";

const NBAMatchCentre = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [fixtures, setFixtures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFixtures = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('nba_fixtures')
        .select('*')
        .order('date_edst', { ascending: true });

      if (error) throw error;
      
      setFixtures(data || []);
    } catch (error: any) {
      console.error('Error fetching NBA fixtures:', error);
      toast({
        title: "Error loading fixtures",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFixtures();
  }, []);

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => navigate("/sports/nba")}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchFixtures}
          disabled={loading}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div>
        <h1 className="text-3xl md:text-4xl font-bold mb-2">NBA Match Centre</h1>
        <p className="text-lg text-muted-foreground">
          Upcoming games, daily matchups, and match details
        </p>
      </div>

      <Card className="p-6">
        <FixturesList fixtures={fixtures} sport="nba" loading={loading} />
      </Card>
    </div>
  );
};

export default NBAMatchCentre;
