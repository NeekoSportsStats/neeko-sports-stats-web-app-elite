import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";

const CreatePassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const session_id = searchParams.get("session_id");
    if (!session_id) {
      toast.error("Invalid session");
      navigate("/");
      return;
    }
    
    setSessionId(session_id);
    
    // Fetch session details from Stripe via edge function
    const fetchSessionDetails = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("verify-checkout-session", {
          body: { session_id },
        });
        
        if (error) throw error;
        
        setEmail(data.email);
        
        // Auto-login the user
        const { error: signInError } = await supabase.auth.signInWithOtp({
          email: data.email,
          options: {
            shouldCreateUser: false,
          }
        });
        
        if (signInError) {
          console.error("Auto-login error:", signInError);
        }
      } catch (error) {
        console.error("Error fetching session:", error);
        toast.error("Failed to verify session");
      }
    };
    
    fetchSessionDetails();
  }, [searchParams, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password.length < 12) {
      toast.error("Password must be at least 12 characters");
      return;
    }

    if (password.length > 128) {
      toast.error("Password must be less than 128 characters");
      return;
    }

    if (!/[A-Z]/.test(password)) {
      toast.error("Password must contain at least one uppercase letter");
      return;
    }

    if (!/[a-z]/.test(password)) {
      toast.error("Password must contain at least one lowercase letter");
      return;
    }

    if (!/[0-9]/.test(password)) {
      toast.error("Password must contain at least one number");
      return;
    }
    
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    
    if (!email || !sessionId) {
      toast.error("Invalid session");
      return;
    }
    
    setLoading(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        toast.error("Authentication required. Please contact support.");
        return;
      }

      // Use authenticated function to update password with session validation
      const { error: updateError } = await supabase.functions.invoke("set-user-password", {
        body: { password, session_id: sessionId },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      
      if (updateError) throw updateError;
      
      // Now sign in with the new password
      const { error: finalSignInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (finalSignInError) throw finalSignInError;
      
      toast.success("Password set successfully! Welcome to Neeko+");
      navigate("/");
    } catch (error) {
      console.error("Error setting password:", error);
      toast.error("Failed to set password. Please contact support.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-secondary/20 to-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create Your Password</CardTitle>
          <CardDescription>
            Welcome to Neeko+! Set a password to secure your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email || "Loading..."}
                disabled
                className="bg-muted"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 12 chars, uppercase, lowercase, number"
                  required
                  minLength={12}
                  maxLength={128}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  required
                  minLength={12}
                  maxLength={128}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            
            <Button type="submit" className="w-full" disabled={loading || !email}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Setting Password...
                </>
              ) : (
                "Set Password"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreatePassword;
