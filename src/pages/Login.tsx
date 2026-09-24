import { Link, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { MathCaptcha, type MathCaptchaHandle } from "@/components/MathCaptcha";
import securityBadgesImg from "@/assets/security-badges.png";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Sparkles, ShieldCheck, TrendingUp, Lock, Eye, EyeOff } from "lucide-react";
import authHero from "@/assets/auth-hero.jpg";
import { Logo } from "@/components/Logo";

export default function Login({ admin = false }: { admin?: boolean }) {
  const nav = useNavigate();
  const loc = useLocation();
  const { user, isAdmin, loading } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const captchaRef = useRef<MathCaptchaHandle>(null);

  useEffect(() => {
    if (loading) return;
    if (user) {
      if (admin && isAdmin) nav("/admin", { replace: true });
      else if (admin && !isAdmin) {
        // logged in but not admin — show toast, do not redirect
      } else nav((loc.state as any)?.from?.pathname ?? "/app", { replace: true });
    }
  }, [user, isAdmin, loading, admin, nav, loc.state]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!captchaRef.current?.verify()) {
      captchaRef.current?.reset();
      return toast.error("Incorrect answer to the security check. Try again.");
    }
    setBusy(true);

    // Resolve username -> email if needed
    let email = identifier.trim();
    if (!email.includes("@")) {
      const { data: resolved, error: rErr } = await supabase.rpc("lookup_email_for_login", {
        _identifier: email,
      });
      if (rErr || !resolved) {
        setBusy(false);
        return toast.error("No account found for that username");
      }
      email = resolved as string;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    const { data: { user: u } } = await supabase.auth.getUser();
    if (u) {
      supabase.from("login_history").insert({
        user_id: u.id,
        user_agent: navigator.userAgent,
      });
    }
    toast.success("Welcome back!");
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-hero p-10">
        <img src={authHero} alt="Haratrading crypto trading platform" className="absolute inset-0 h-full w-full object-cover opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-br from-background/90 via-background/50 to-primary/30" />
        <Link to="/" className="relative inline-flex items-center gap-2 text-foreground">
          <Logo className="h-10 w-auto" />
        </Link>
        <div className="relative space-y-6 text-foreground">
          <h2 className="text-4xl font-bold leading-tight max-w-md">
            {admin ? "Administrative Control Center" : "Trade smarter. Stake stronger."}
          </h2>
          <p className="text-foreground/70 max-w-md">
            {admin
              ? "Manage deposits, withdrawals, users and platform settings from one secure dashboard."
              : "Join thousands of traders building wealth with a platform built for trust, speed and clarity."}
          </p>
          <ul className="space-y-3 text-sm text-foreground/80">
            <li className="flex items-center gap-3"><ShieldCheck className="h-4 w-4 text-primary" /> Bank-grade security & encrypted vaults</li>
            <li className="flex items-center gap-3"><TrendingUp className="h-4 w-4 text-primary" /> Live markets powered by global data</li>
            <li className="flex items-center gap-3"><Lock className="h-4 w-4 text-primary" /> Self-custody options on supported chains</li>
          </ul>
        </div>
        <p className="relative text-xs text-foreground/50">© {new Date().getFullYear()} Haratrading. All rights reserved.</p>
      </div>

      <div className="relative flex items-center justify-center p-6 sm:p-10 overflow-hidden">
        <div className="pointer-events-none absolute -top-32 -right-32 h-80 w-80 rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative w-full max-w-md space-y-8">
          <div className="lg:hidden flex justify-center">
            <Link to="/" className="inline-flex items-center gap-2">
              <Logo className="h-9 w-auto" />
            </Link>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card/70 p-7 sm:p-8 shadow-elegant backdrop-blur-xl space-y-7">
            <div className="space-y-2 text-center lg:text-left">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <Sparkles className="h-3 w-3" /> {admin ? "Admin portal" : "Secure sign in"}
              </span>
              <h1 className="text-3xl font-bold tracking-tight">{admin ? "Admin Sign In" : "Welcome back"}</h1>
              <p className="text-muted-foreground text-sm">
                {admin ? "Restricted access — administrators only." : "Sign in with your email or username."}
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="identifier">Email or username</Label>
                <Input
                  id="identifier"
                  required
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="you@example.com or yourname"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link to="/forgot-password" className="text-xs text-primary hover:underline">Forgot?</Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={show ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                    aria-label={show ? "Hide password" : "Show password"}
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <MathCaptcha ref={captchaRef} />

              <Button type="submit" disabled={busy} className="h-11 w-full bg-gradient-primary shadow-elegant text-base">
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign in
              </Button>
              {!admin && (
                <p className="text-center text-sm text-muted-foreground">
                  New here?{" "}
                  <Link to="/signup" className="text-primary font-medium hover:underline">Create an account</Link>
                </p>
              )}
            </form>
          </div>
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" /> Protected with end-to-end encryption
          </p>
          <img
            src={securityBadgesImg}
            alt="Secure SSL encryption, privacy protected, secure payments"
            className="mx-auto w-full max-w-[260px] rounded-lg"
            loading="lazy"
          />
        </div>
      </div>
    </div>
  );
}
