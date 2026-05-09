// src/pages/ResetPassword.tsx
import { useState, useEffect, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

import { Eye, EyeOff, ArrowLeft, CircleCheck as CheckCircle, Trophy, Loader as Loader2 } from "lucide-react";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const [checking, setChecking] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);

  const { toast } = useToast();
  const navigate = useNavigate();
  const isUpdatingRef = useRef(false);

  useEffect(() => {
    const checkRecovery = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (session?.user && session.user?.email) {
        setTokenValid(true);
      }

      setChecking(false);
    };

    checkRecovery();
  }, []);

  useEffect(() => {
    if (!checking && !tokenValid) {
      toast({
        title: "Invalid or expired link",
        description: "Please request a new password reset link.",
        variant: "destructive",
      });
      navigate("/forgot-password");
    }
  }, [checking, tokenValid, navigate, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!tokenValid) return;

    if (isUpdatingRef.current) {
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Passwords do not match",
        description: "Both fields must match.",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 10) {
      toast({
        title: "Password too short",
        description: "Minimum 10 characters.",
        variant: "destructive",
      });
      return;
    }

    isUpdatingRef.current = true;
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.updateUser({ password });

      if (error) throw error;

      setLoading(false);
      setSuccess(true);

      toast({
        title: "Password updated",
        description: "You can now sign in with your new password.",
      });

      if (window.location.pathname.startsWith("/reset-password")) {
        window.history.replaceState({}, "", "/reset-password");
      }

      navigate("/auth", { replace: true, state: { fromPasswordReset: true } });

    } catch (error: any) {
      console.error("RESET → updateUser error:", error);
      setLoading(false);
      isUpdatingRef.current = false;

      toast({
        title: "Error",
        description: error.message || "Failed to update password.",
        variant: "destructive",
      });
    }
  };

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="container max-w-md py-12 flex items-center justify-center min-h-[70vh]">
        <Card className="w-full text-center">
          <CardHeader>
            <div className="flex justify-center mb-3">
              <CheckCircle className="h-16 w-16 text-green-500" />
            </div>
            <CardTitle>Password Reset Successful</CardTitle>
            <CardDescription>Redirecting you to sign in…</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button className="w-full" onClick={() => navigate("/auth")}>
              Sign In Now
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-md py-12 flex items-center justify-center min-h-[70vh]">
      <Helmet>
        <title>Reset Password | Neeko Sports Stats</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <Card className="w-full">
        <CardHeader>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/auth")}
            className="mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>

          <div className="flex items-center gap-2 mb-2">
            <Trophy className="h-6 w-6 text-primary" />
            <CardTitle>Choose a New Password</CardTitle>
          </div>

          <CardDescription>Enter and confirm your new password.</CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>New Password</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  placeholder="New password"
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  disabled={loading}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Confirm Password</Label>
              <div className="relative">
                <Input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  placeholder="Confirm password"
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  disabled={loading}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </CardContent>

          <CardFooter>
            <Button className="w-full" disabled={loading} type="submit">
              {loading ? "Updating…" : "Update Password"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default ResetPassword;
