import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Circle as XCircle } from "lucide-react";
import { track } from "@/lib/analytics";

const Cancel = () => {
  const navigate = useNavigate();

  useEffect(() => {
    track("checkout_cancelled");
    const timeout = setTimeout(() => {
      navigate("/neeko-plus", { replace: true });
    }, 10000); // Increased to 10 seconds

    return () => clearTimeout(timeout);
  }, [navigate]);

  return (
    <div className="container max-w-2xl py-12 flex items-center justify-center min-h-[70vh]">
      <Helmet>
        <title>Checkout Cancelled | Neeko Sports Stats</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <Card className="w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <XCircle className="h-16 w-16 text-amber-500" />
          </div>
          <CardTitle className="text-2xl">Checkout Cancelled</CardTitle>
          <CardDescription>
            Your subscription checkout was cancelled
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">
            No charges were made to your account. You can try again anytime.
          </p>
          <p className="text-sm text-muted-foreground">
            Redirecting to subscription page in 10 seconds...
          </p>

          <div className="pt-4 border-t border-border">
            <p className="text-sm font-medium text-foreground mb-3">
              Continue browsing free insights
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                onClick={() => navigate("/fantasy/rankings")}
                variant="outline"
                size="sm"
              >
                View Rankings
              </Button>
              <Button
                onClick={() => navigate("/fantasy/market-watch")}
                variant="outline"
                size="sm"
              >
                Market Watch
              </Button>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex gap-4 justify-center">
          <Button onClick={() => { navigate("/neeko-plus", { replace: true }); }} variant="default">
            View Subscription Plans
          </Button>
          <Button onClick={() => navigate("/")} variant="outline">
            Go to Home
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default Cancel;
