import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function StripeTest() {
  const { user, checkAdminRole } = useAuth();
  const navigate = useNavigate();
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Check admin status
  useState(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    checkAdminRole().then(isAdminUser => {
      if (!isAdminUser) {
        toast.error("Admin access required");
        navigate("/");
      } else {
        setIsAdmin(true);
      }
    });
  });

  const runTests = async () => {
    setIsRunning(true);
    setResults(null);

    try {
      const response = await supabase.functions.invoke("test-stripe-integration");

      if (response.error) {
        throw response.error;
      }

      setResults(response.data);
      
      if (response.data.overall?.includes("ALL TESTS PASSED")) {
        toast.success("All Stripe integration tests passed!");
      } else {
        toast.warning("Some tests failed. Check results below.");
      }
    } catch (error) {
      console.error("Test error:", error);
      toast.error("Failed to run tests");
      setResults({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsRunning(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Stripe Integration Test</h1>

      <Card className="p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Test Configuration</h2>
        <div className="space-y-2 text-sm">
          <p>This test will verify:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Customer signup with subscription</li>
            <li>Subscription status updates</li>
            <li>Subscription cancellation</li>
            <li>Automatic role assignment (free ↔ premium)</li>
          </ul>
        </div>
      </Card>

      <Button
        onClick={runTests}
        disabled={isRunning}
        className="mb-6"
        size="lg"
      >
        {isRunning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isRunning ? "Running Tests..." : "Run Integration Tests"}
      </Button>

      {results && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Test Results</h2>
          
          {results.error ? (
            <div className="text-destructive">
              <p className="font-semibold">Error:</p>
              <pre className="mt-2 p-4 bg-muted rounded text-sm overflow-auto">
                {results.error}
              </pre>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <div className="text-2xl font-bold mb-2">
                  {results.overall}
                </div>
                <div className="text-sm text-muted-foreground">
                  {results.timestamp}
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <h3 className="font-semibold">Test Results:</h3>
                
                <div className="space-y-3">
                  {Object.entries(results.results || {}).map(([key, value]: [string, any]) => (
                    <div key={key} className="border rounded p-4">
                      <div className="flex items-start justify-between mb-2">
                        <span className="font-medium">
                          {key.replace(/_/g, " ").toUpperCase()}
                        </span>
                        <span className={`font-bold ${
                          value.status.includes("SUCCESS") 
                            ? "text-green-600" 
                            : value.status.includes("FAILED")
                            ? "text-destructive"
                            : "text-yellow-600"
                        }`}>
                          {value.status}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {value.details}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">Configuration:</h3>
                <div className="space-y-2 text-sm">
                  {Object.entries(results.config || {}).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-muted-foreground">
                        {key.replace(/_/g, " ").toUpperCase()}:
                      </span>
                      <span className={
                        String(value).includes("Configured") 
                          ? "text-green-600 font-medium"
                          : "text-destructive font-medium"
                      }>
                        {String(value)}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">WEBHOOK URL:</span>
                    <span className="font-mono text-xs">{results.webhook_url}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}