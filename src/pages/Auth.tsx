// src/pages/Auth.tsx
import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { track, identifyUser } from "@/lib/analytics";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Trophy, ArrowLeft, Eye, EyeOff, Crown, Zap } from "lucide-react";
import { NEEKO_PRICING } from "@/config/neekoPricing";
import type { NeekoPlan } from "@/config/neekoPricing";

const emailSchema = z.string().email("Invalid email address");

const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .regex(/[A-Z]/, "Must contain at least one uppercase letter")
  .regex(/[a-z]/, "Must contain at least one lowercase letter")
  .regex(/[0-9]/, "Must contain at least one number")
  .regex(/[^A-Za-z0-9]/, "Must contain at least one symbol");

const VALID_PLANS = new Set<string>(["round_pass_7d", "weekly", "season"]);

function isValidPlan(val: string | null): val is NeekoPlan {
  return val !== null && VALID_PLANS.has(val);
}

function planLabel(plan: NeekoPlan): string {
  if (plan === "round_pass_7d") return "7-Day Round Pass";
  if (plan === "season") return "Season Pass";
  return "Weekly";
}

function planPrice(plan: NeekoPlan): string {
  if (plan === "round_pass_7d") return `$${NEEKO_PRICING.round_pass_7d.price} AUD`;
  if (plan === "season") return `$${NEEKO_PRICING.season.price} AUD`;
  return `$${NEEKO_PRICING.weekly.price} AUD/wk`;
}

function planNote(plan: NeekoPlan): string {
  if (plan === "round_pass_7d") return "One-time payment · 7 days full access · No subscription";
  if (plan === "season") return "One-time payment · Full 2026 season access";
  return "Weekly subscription · Cancel anytime";
}

function PlanCard({ plan }: { plan: NeekoPlan }) {
  return (
    <div style={{
      background: plan === "season"
        ? "linear-gradient(160deg, #1c1507 0%, #110e04 100%)"
        : plan === "round_pass_7d"
          ? "linear-gradient(160deg, #0d1829 0%, #07101e 100%)"
          : "rgba(255,255,255,0.04)",
      border: `1px solid ${
        plan === "season"
          ? "rgba(224,174,45,0.40)"
          : plan === "round_pass_7d"
            ? "rgba(96,165,250,0.40)"
            : "rgba(255,255,255,0.18)"
      }`,
      borderRadius: 12,
      padding: "14px 16px",
      marginBottom: 20,
      display: "flex",
      alignItems: "center",
      gap: 12,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 9, flexShrink: 0,
        background: plan === "season"
          ? "rgba(224,174,45,0.12)"
          : plan === "round_pass_7d"
            ? "rgba(96,165,250,0.12)"
            : "rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {plan === "season" ? (
          <Crown size={16} style={{ color: "#E0AE2D" }} />
        ) : (
          <Zap size={16} style={{ color: plan === "round_pass_7d" ? "#60a5fa" : "#F5F5F5" }} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#F5F5F5" }}>
          {planLabel(plan)}
        </p>
        <p style={{ margin: "1px 0 0", fontSize: 11, color: "rgba(255,255,255,0.40)" }}>
          {planNote(plan)}
        </p>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <p style={{
          margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: "-0.03em",
          color: plan === "season" ? "#E0AE2D" : plan === "round_pass_7d" ? "#60a5fa" : "#F5F5F5",
        }}>
          {planPrice(plan)}
        </p>
      </div>
    </div>
  );
}

const Auth = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const rawPlanKey = searchParams.get("plan_key") ?? searchParams.get("plan");
  const planKey: NeekoPlan | null = isValidPlan(rawPlanKey) ? rawPlanKey : null;
  const isPurchaseIntent = planKey !== null;

  const [mode, setMode] = useState<"login" | "signup">(isPurchaseIntent ? "signup" : "login");

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

  const SAFE_REDIRECTS = new Set(["/", "/account", "/dashboard", "checkout", "account"]);
  const rawRedirect = searchParams.get("redirect") || "/";

  function getPostAuthPath(): string {
    if (planKey) {
      return `/start-checkout?plan_key=${planKey}`;
    }
    if (rawRedirect === "checkout") return "/start-checkout";
    if (rawRedirect === "account") return "/account";
    if (SAFE_REDIRECTS.has(rawRedirect)) return rawRedirect;
    return "/";
  }

  useEffect(() => {
    if (!user) return;
    const path = window.location.pathname;
    if (path.includes("forgot-password") || path.includes("reset-password")) return;
    navigate(getPostAuthPath(), { replace: true });
  }, [user]);

  useEffect(() => {
    if (isPurchaseIntent) {
      track("auth_checkout_viewed", {
        plan_key: planKey,
        mode,
      });
    }
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFormError(null);

    try {
      emailSchema.parse(email);

      if (mode === "login") {
        if (isPurchaseIntent) {
          track("auth_signin_started", { plan_key: planKey });
        }

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
      if (isPurchaseIntent) {
        track("auth_signup_started", { plan_key: planKey });
      }

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
            {isPurchaseIntent
              ? mode === "signup"
                ? "Create account to continue"
                : "Sign in to continue"
              : mode === "login"
                ? "Welcome Back"
                : "Create Account"}
          </h2>
          {isPurchaseIntent && (
            <p className="text-sm text-muted-foreground">
              You&apos;ll be taken straight to checkout after {mode === "signup" ? "signing up" : "signing in"}.
            </p>
          )}
        </div>

        {/* Plan card — only shown for purchase intent */}
        {isPurchaseIntent && planKey && <PlanCard plan={planKey} />}

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
            {loading
              ? "Loading..."
              : mode === "login"
                ? isPurchaseIntent ? "Sign In & Continue to Checkout" : "Sign In"
                : isPurchaseIntent ? "Create Account & Continue" : "Sign Up"}
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
