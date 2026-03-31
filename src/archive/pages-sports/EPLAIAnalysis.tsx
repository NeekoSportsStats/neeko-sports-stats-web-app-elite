import { Card } from "@/components/ui/card";
import { Lock, Crown, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

interface Insight {
  category: string;
  title: string;
  description: string;
  example: string;
}

const EPLAIAnalysis = () => {
  const { isPremium, checkAdminRole } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [freeInsights, setFreeInsights] = useState<Insight[]>([]);
  const [premiumInsights, setPremiumInsights] = useState<Insight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const fetchInsights = async () => {
    try {
      setIsLoading(true);
      
      const { data: publicData, error: publicError } = await supabase
        .from('ai_insights_public')
        .select('free_insights')
        .eq('sport', 'EPL')
        .maybeSingle();
      
      if (publicError) throw publicError;
      
      const { data: premiumData, error: premiumError } = await supabase
        .from('ai_insights_premium')
        .select('premium_insights')
        .eq('sport', 'EPL')
        .maybeSingle();
      
      if (publicData) {
        setFreeInsights(publicData.free_insights as unknown as Insight[]);
      }
      
      if (premiumData && !premiumError) {
        setPremiumInsights(premiumData.premium_insights as unknown as Insight[]);
      } else {
        setPremiumInsights(Array(14).fill({
          category: "Premium",
          title: "Locked",
          description: "Subscribe to unlock this insight",
          example: ""
        }));
      }
      
      if (!publicData && !premiumData) {
        toast({
          title: "No insights available",
          description: "AI insights haven't been generated yet.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error fetching AI insights:', error);
      toast({
        title: "Error loading insights",
        description: "Failed to fetch AI analysis. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!isAdmin) {
      toast({
        title: "Unauthorized",
        description: "Admin access required to refresh data.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsRefreshing(true);
      
      const { data, error } = await supabase.functions.invoke('update-all-ai-analysis');
      
      if (error) {
        if (error.message?.includes('wait')) {
          toast({
            title: "Rate Limited",
            description: error.message,
            variant: "destructive",
          });
          return;
        }
        throw error;
      }
      
      await fetchInsights();
      
      toast({
        title: "✅ Data refreshed",
        description: "All AI insights have been updated.",
      });
    } catch (error: any) {
      console.error('Error refreshing data:', error);
      toast({
        title: "Error refreshing data",
        description: error?.message || "Failed to update data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchInsights();
    checkAdminRole().then((isAdminResult) => {
      setIsAdmin(isAdminResult);
    });
  }, []);

  const handlePremiumClick = () => {
    if (!isPremium) {
      window.location.href = 'https://www.neekostats.com.au/neeko-plus';
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 space-y-12">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl md:text-4xl font-bold">EPL AI Analysis</h1>
          <p className="text-muted-foreground">
            Real-time insights generated from live player and team data.
          </p>
        </div>
        {isAdmin && (
          <Button 
            onClick={handleRefresh} 
            disabled={isRefreshing}
            variant="outline"
            size="sm"
            className="bg-primary/10 border-primary hover:bg-primary/20"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh AI Analysis
          </Button>
        )}
      </div>
      
      <div>
        <h2 className="text-2xl font-bold mb-6">Free Insights</h2>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[...Array(6)].map((_, idx) => (
              <Card key={idx} className="p-6 h-[280px]">
                <div className="space-y-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              </Card>
            ))}
          </div>
        ) : freeInsights.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {freeInsights.slice(0, 6).map((insight, idx) => (
              <Card key={idx} className="p-6 hover:shadow-lg transition-all h-[280px] flex flex-col">
                <div className="flex-1 space-y-3">
                  <div className="text-xs font-semibold text-primary uppercase tracking-wide">
                    {insight.category}
                  </div>
                  <h3 className="font-bold text-lg leading-tight">{insight.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">
                    {insight.description}
                  </p>
                  <div className="pt-2 mt-auto border-t">
                    <p className="text-xs text-muted-foreground/70 leading-relaxed line-clamp-3">
                      {insight.example}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">No insights available. An admin needs to generate insights.</p>
          </Card>
        )}
      </div>
      
      <div>
        <div className="mb-6 space-y-1">
          <h2 className="text-2xl font-bold">Neeko+ Insights {!isPremium && "(Locked)"}</h2>
          <p className="text-sm text-muted-foreground">
            {isPremium ? "Advanced AI insights for premium subscribers." : "Unlock 14 premium insights for $5.99/week."}
          </p>
        </div>
        
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[...Array(14)].map((_, idx) => (
              <Card key={idx} className="p-6 h-[280px]">
                <div className="space-y-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              </Card>
            ))}
          </div>
        ) : premiumInsights.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {premiumInsights.slice(0, 14).map((insight, idx) => (
              <Card 
                key={idx} 
                onClick={() => !isPremium && handlePremiumClick()}
                className={`p-6 transition-all h-[280px] flex flex-col relative ${
                  !isPremium 
                    ? 'cursor-pointer hover:shadow-lg hover:border-primary/50' 
                    : 'hover:shadow-lg'
                }`}
              >
                {!isPremium ? (
                  <>
                    <div className="blur-sm select-none pointer-events-none">
                      <div className="text-xs font-semibold text-primary uppercase tracking-wide mb-3">
                        Premium Analysis
                      </div>
                      <h3 className="font-bold text-lg leading-tight mb-3">Advanced Insights Available</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Detailed player statistics and strategic analysis with comprehensive data points
                      </p>
                      <div className="pt-2 mt-4 border-t">
                        <p className="text-xs text-muted-foreground/70">
                          Example data and detailed metrics included
                        </p>
                      </div>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center bg-background/40">
                      <div className="bg-card border border-primary/50 rounded-lg p-6 shadow-xl text-center">
                        <Lock className="h-8 w-8 text-primary mx-auto mb-2" />
                        <p className="font-bold text-sm">Locked</p>
                        <p className="text-xs text-muted-foreground">Neeko+ Required</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-primary uppercase tracking-wide">
                        {insight.category}
                      </div>
                      <Crown className="h-4 w-4 text-primary" />
                    </div>
                    <h3 className="font-bold text-lg leading-tight">{insight.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">
                      {insight.description}
                    </p>
                    <div className="pt-2 mt-auto border-t">
                      <p className="text-xs text-muted-foreground/70 leading-relaxed line-clamp-3">
                        {insight.example}
                      </p>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">No premium insights available.</p>
          </Card>
        )}
        {!isPremium && (
          <div className="mt-12 text-center">
            <Card className="max-w-md mx-auto p-8 border-primary/50 bg-gradient-to-br from-primary/5 to-transparent">
              <Lock className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="text-2xl font-bold mb-2">Unlock All Premium Insights</h3>
              <p className="text-muted-foreground mb-6">
                Get access to 14 advanced AI insights updated automatically from live data.
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

export default EPLAIAnalysis;
