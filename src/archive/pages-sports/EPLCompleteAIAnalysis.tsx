import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertCircle, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { AIAnalysisBlock } from "@/components/ai/AIAnalysisBlock";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AIInsight {
  rank: number;
  player_name: string;
  explanation: string;
  sparkline_data: number[];
  stat_value: string;
  stat_label: string;
  is_premium: boolean;
}

interface BlockData {
  title: string;
  type: string;
  players: AIInsight[];
}

export default function EPLCompleteAIAnalysis() {
  const navigate = useNavigate();
  const { user, isPremium } = useAuth();
  const [blocks, setBlocks] = useState<BlockData[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    checkAdminStatus();
    fetchAIInsights();
  }, [user]);

  // Client-side check for UI display only - actual security enforced server-side
  // All admin edge functions verify JWT and check has_role() RPC
  const checkAdminStatus = async () => {
    if (!user) {
      setIsAdmin(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      if (error) {
        console.error("Error checking admin status:", error);
        setIsAdmin(false);
        return;
      }

      setIsAdmin(data?.role === "admin");
    } catch (err) {
      console.error("Error in checkAdminStatus:", err);
      setIsAdmin(false);
    }
  };

  const fetchAIInsights = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("ai_epl_analysis")
        .select("*")
        .order("rank");

      if (fetchError) {
        console.error("Error fetching insights:", fetchError);
        throw fetchError;
      }

      if (!data || data.length === 0) {
        setError("No EPL AI insights available yet. Admin can generate insights.");
        setBlocks([]);
        return;
      }

      // Group by block_type
      const groupedData: { [key: string]: BlockData } = {};
      
      data.forEach((item) => {
        if (!groupedData[item.block_type]) {
          groupedData[item.block_type] = {
            title: item.block_title,
            type: item.block_type,
            players: [],
          };
        }

        // Parse sparkline data
        let sparklineData: number[] = [];
        if (Array.isArray(item.sparkline_data)) {
          sparklineData = (item.sparkline_data as any[]).filter((n): n is number => typeof n === 'number');
        } else if (typeof item.sparkline_data === 'string') {
          try {
            const parsed = JSON.parse(item.sparkline_data);
            sparklineData = Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === 'number') : [];
          } catch {
            sparklineData = [];
          }
        }

        const statValue = item.stat_value || "N/A";
        const statLabel = item.stat_label || "Goals";

        groupedData[item.block_type].players.push({
          rank: item.rank || groupedData[item.block_type].players.length + 1,
          player_name: item.player_name || item.team_name || "Unknown",
          explanation: item.explanation,
          sparkline_data: sparklineData,
          stat_value: statValue,
          stat_label: statLabel,
          is_premium: item.is_premium || false,
        });
      });

      const blocksArray = Object.values(groupedData);
      setBlocks(blocksArray);

      // Get the most recent update timestamp
      if (data.length > 0) {
        const mostRecent = data.reduce((latest, current) => 
          new Date(current.created_at) > new Date(latest.created_at) ? current : latest
        );
        setLastRefreshed(mostRecent.created_at);
      }

      console.log("Loaded", blocksArray.length, "EPL AI analysis blocks with", data.length, "total players");
    } catch (err) {
      console.error("Error in fetchAIInsights:", err);
      setError(err instanceof Error ? err.message : "Failed to load AI insights");
      setBlocks([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!isAdmin) {
      toast({
        title: "Access Denied",
        description: "Only admins can refresh AI analysis",
        variant: "destructive",
      });
      return;
    }

    setIsRefreshing(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("No active session");
      }

      const { data, error } = await supabase.functions.invoke("refresh-ai-analysis", {
        body: { sport: "epl" },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error("Refresh error:", error);
        throw error;
      }

      toast({
        title: "Success",
        description: data.message || "EPL AI analysis refreshed successfully",
      });

      // Refresh the data
      await fetchAIInsights();
    } catch (err) {
      console.error("Error refreshing EPL AI analysis:", err);
      toast({
        title: "Refresh Failed",
        description: err instanceof Error ? err.message : "Failed to refresh EPL AI analysis",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <RefreshCw className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Button
        variant="ghost"
        onClick={() => navigate("/sports/epl")}
        className="mb-4"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Button>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">EPL AI Analysis</h1>
          <p className="text-muted-foreground">
            AI-powered insights and player analysis
            {lastRefreshed && (
              <span className="block text-sm mt-1">
                Last updated: {new Date(lastRefreshed).toLocaleString()}
              </span>
            )}
          </p>
        </div>
        
        {isAdmin && (
          <Button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh AI Analysis
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error} {isAdmin && "— Use the refresh button to reload data"}
          </AlertDescription>
        </Alert>
      )}

      {blocks.length === 0 && !error && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            AI data currently unavailable {isAdmin && "— admin can refresh"}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
        {blocks.map((block) => (
          <AIAnalysisBlock
            key={block.type}
            title={block.title}
            players={block.players}
            isPremiumUser={isPremium}
          />
        ))}
      </div>
    </div>
  );
}
