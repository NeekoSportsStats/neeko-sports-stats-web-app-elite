// src/pages/Auth.tsx
import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useSearchParams, useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { track, identifyUser } from "@/lib/analytics";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Trophy, ArrowLeft, Eye, EyeOff } from "lucide-react";

const emailSchema = z.string().email("Invalid email address");

const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .regex(/[A-Z]/, "Must contain at least one uppercase letter")
  .regex(/[a-z]/, "Must contain at least one lowercase letter")
  .regex(/[0-9]/, "Must contain at least one number")
  .regex(/[^A-Za-z0-9]/, "Must contain at least one symbol");

const Auth = () => {
  const [mode, setMode] = useState<"login" | "signup">("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [passwordChecks, setPasswordChecks] = useState({
    length: false,
    upper: false,
    lower: false,
    digit: false,
    symbol: false,
  });

  const [loading, setLoading] = useState(false);

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const SAFE_REDIRECTS = new Set(["/", "/account", "/dashboard", "checkout", "account"]);
  const rawRedirect = searchParams.get("redirect") || "/";
  const redirect = SAFE_REDIRECTS.has(rawRedirect) ? rawRedirect : "/";

  // ⭐ FIXED REDIRECT BEHAVIOUR ⭐
  useEffect(() => {
    if (!user) return;

    // 🚫 Block redirects during password recovery
    const path = window.location.pathname;
    if (path.includes("forgot-password") || path.includes("reset-password")) {
      return;
    }

    if (redirect === "checkout") {
      navigate("/start-checkout", { replace: true });
      return;
    }

    if (redirect === "account") {
      navigate("/account", { replace: true });
      return;
    }

    navigate(redirect, { replace: true });
  }, [user, redirect, navigate]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFormError(null);

    try {
      emailSchema.parse(email);

      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error?.code === "invalid_credentials") {
          setFormError("Incorrect email or password");
          return;
        }

        if (!data?.user) {
          setFormError("Incorrect email or password");
          return;
        }

        identifyUser({ id: data.user.id, email: data.user.email });
        track("user_logged_in", { method: "email" });
        return;
      }

      // SIGNUP
      passwordSchema.parse(password);

      if (password !== confirmPassword) {
        setFormError("Passwords do not match");
        return;
      }

      const { data: signUpData, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error?.code === "user_already_exists") {
        setFormError("An account with this email already exists.");
        return;
      }

      if (error) {
        setFormError(error.message || "Sign up failed.");
        return;
      }

      if (signUpData?.user) {
        identifyUser({ id: signUpData.user.id, email: signUpData.user.email });
        track("user_signed_up", { method: "email" });
      }
    } finally {
      setLoading(false);
    }
  };

  const canSubmit =
    mode === "login"
      ? email !== "" && password !== "" && !emailError
      : email !== "" &&
        password !== "" &&
        confirmPassword !== "" &&
        !emailError &&
        passwordChecks.length &&
        passwordChecks.upper &&
        passwordChecks.lower &&
        passwordChecks.digit &&
        passwordChecks.symbol &&
        password === confirmPassword;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Helmet>
        <title>Sign In | Neeko Sports Stats</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <Card className="w-full max-w-md p-8 space-y-6">
        <Button
          onClick={() => navigate("/")}
          variant="ghost"
          size="sm"
          className="-mt-2 mb-2"
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>

        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Trophy className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold gradient-text">
              Neeko&apos;s Sports Stats
            </h1>
          </div>

          <h2 className="text-xl font-semibold">
            {mode === "login" ? "Welcome Back" : "Create Account"}
          </h2>
        </div>

        {/* FORM */}
        <form onSubmit={handleAuth} className="space-y-4">
          {/* EMAIL */}
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                try {
                  emailSchema.parse(e.target.value);
                  setEmailError(null);
                } catch {
                  setEmailError("Invalid email address");
                }
              }}
              autoComplete="email"
              required
            />
            {emailError && (
              <p className="text-red-500 text-xs">{emailError}</p>
            )}
          </div>

          {/* PASSWORD */}
          <div className="space-y-2">
            <Label>Password</Label>

            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => {
                  const v = e.target.value;
                  setPassword(v);
                  setPasswordChecks({
                    length: v.length >= 10,
                    upper: /[A-Z]/.test(v),
                    lower: /[a-z]/.test(v),
                    digit: /[0-9]/.test(v),
                    symbol: /[^A-Za-z0-9]/.test(v),
                  });
                }}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4 text-white/70" />
                ) : (
                  <Eye className="h-4 w-4 text-white/70" />
                )}
              </button>
            </div>

            {mode === "signup" && (
              <div className="text-xs space-y-1 mt-2">
                <p className={passwordChecks.length ? "text-green-500" : "text-red-500"}>
                  {passwordChecks.length ? "✔" : "✘"} 10+ characters
                </p>
                <p className={passwordChecks.upper ? "text-green-500" : "text-red-500"}>
                  {passwordChecks.upper ? "✔" : "✘"} Uppercase letter
                </p>
                <p className={passwordChecks.lower ? "text-green-500" : "text-red-500"}>
                  {passwordChecks.lower ? "✔" : "✘"} Lowercase letter
                </p>
                <p className={passwordChecks.digit ? "text-green-500" : "text-red-500"}>
                  {passwordChecks.digit ? "✔" : "✘"} Number
                </p>
                <p className={passwordChecks.symbol ? "text-green-500" : "text-red-500"}>
                  {passwordChecks.symbol ? "✔" : "✘"} Symbol
                </p>
              </div>
            )}
          </div>

          {/* CONFIRM PASSWORD */}
          {mode === "signup" && (
            <div className="space-y-2">
              <Label>Confirm Password</Label>
              <div className="relative">
                <Input
                  type={showConfirm ? "text" : "password"}
                  className={
                    confirmPassword && confirmPassword !== password
                      ? "border-red-500"
                      : ""
                  }
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  {showConfirm ? <EyeOff className="h-4 w-4 text-white/70" /> : <Eye className="h-4 w-4 text-white/70" />}
                </button>
              </div>

              {confirmPassword && confirmPassword !== password && (
                <p className="text-red-500 text-xs mt-1">Passwords do not match.</p>
              )}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading || !canSubmit}>
            {loading ? "Loading..." : mode === "login" ? "Sign In" : "Sign Up"}
          </Button>

          {/* INLINE ERROR MESSAGE */}
          {formError && (
            <p className="text-red-500 text-sm text-center mt-2">
              {formError}
            </p>
          )}
        </form>

        {mode === "login" && (
          <div className="text-center mt-2">
            <button
              onClick={() => navigate("/forgot-password")}
              className="text-primary text-sm hover:underline"
            >
              Forgot your password?
            </button>
          </div>
        )}

        <div className="text-center text-sm">
          <button
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="text-primary hover:underline"
          >
            {mode === "login"
              ? "Don't have an account? Sign up"
              : "Already have an account? Sign in"}
          </button>
        </div>
      </Card>
    </div>
  );
};

export default Auth;
