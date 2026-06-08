import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — LoadFit" },
      { name: "description", content: "Sign in to save and share your load plans." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/" });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error: e1 } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (e1) throw e1;
      } else {
        const { error: e1 } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (e1) throw e1;
      }
      router.invalidate();
      navigate({ to: "/" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Authentication failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b-2 border-rule">
        <div className="max-w-md mx-auto px-6 py-4 flex items-center gap-3">
          <div className="size-9 bg-rule flex items-center justify-center">
            <div className="size-3.5 bg-background" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground leading-none">
              LoadFit
            </p>
            <p className="text-sm font-semibold leading-tight">
              Freight Trailer Estimator
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-rule text-background px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em]">
              {mode === "signup" ? "Create Account" : "Sign In"}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {mode === "signup" ? "Save & share load plans" : "Welcome back"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {mode === "signup"
                ? "Your jobs sync across devices and unlock shareable read-only links for brokers and customers."
                : "Sign in to access your saved jobs and shareable links."}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4 bg-card ring-2 ring-rule p-6">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Email
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-background border-2 border-rule px-3 py-2 text-sm focus:outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Password
              </label>
              <input
                type="password"
                required
                minLength={8}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-background border-2 border-rule px-3 py-2 text-sm focus:outline-none"
              />
            </div>
            {error && (
              <p className="text-xs text-destructive font-medium">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full text-xs font-bold py-3 px-4 bg-rule text-background uppercase tracking-widest hover:opacity-90 disabled:opacity-40"
            >
              {loading
                ? "Working..."
                : mode === "signup"
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>

          <div className="text-center text-xs text-muted-foreground">
            {mode === "signup" ? (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => setMode("signin")}
                  className="underline font-bold"
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                No account yet?{" "}
                <button
                  type="button"
                  onClick={() => setMode("signup")}
                  className="underline font-bold"
                >
                  Create one
                </button>
              </>
            )}
          </div>
          <p className="text-center text-[10px] text-muted-foreground">
            <Link to="/" className="underline">Continue without signing in</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
