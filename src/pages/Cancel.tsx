import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Circle as XCircle } from "lucide-react";
import { track } from "@/lib/analytics";

const Cancel = () => {
  const navigate = useNavigate();

  useEffect(() => {
    track("checkout_cancelled");
    const timeout = setTimeout(() => {
      window.location.href = "https://www.neekostats.com.au/neeko-plus";
    }, 5000);

    return () => clearTimeout(timeout);
  }, [navigate]);

  return (
    <div className="container max-w-2xl py-12 flex items-center justify-center min-h-[70vh]">
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
            Redirecting you back to the subscription page in 5 seconds...
          </p>
        </CardContent>
        <CardFooter className="flex gap-4 justify-center">
          <Button onClick={() => { window.location.href = "https://www.neekostats.com.au/neeko-plus"; }} variant="default">
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
