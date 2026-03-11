import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "@/lib/router";
import { authApi } from "../api/auth";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { HeroAnimation } from "@/components/HeroAnimation";

type AuthMode = "sign_in" | "sign_up";

export function AuthPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<AuthMode>("sign_in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const nextPath = useMemo(() => searchParams.get("next") || "/", [searchParams]);
  const { data: session, isLoading: isSessionLoading } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });

  useEffect(() => {
    if (session) {
      navigate(nextPath, { replace: true });
    }
  }, [session, navigate, nextPath]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === "sign_in") {
        await authApi.signInEmail({ email: email.trim(), password });
        return;
      }
      await authApi.signUpEmail({
        name: name.trim(),
        email: email.trim(),
        password,
      });
    },
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      navigate(nextPath, { replace: true });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Authentication failed");
    },
  });

  const canSubmit =
    email.trim().length > 0 &&
    password.trim().length >= 8 &&
    (mode === "sign_in" || name.trim().length > 0);

  if (isSessionLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
      </div>
    );
  }

  const inputClasses =
    "w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 placeholder:text-white/20 transition-colors";

  return (
    <div className="fixed inset-0 overflow-auto">
      {/* Animated background */}
      <HeroAnimation />

      {/* Content overlay */}
      <div className="relative z-10 flex min-h-full items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-8">
            <img src="/logo.svg" alt="Substaff" className="h-7 w-7" />
            <span className="text-base font-semibold text-white/90 tracking-tight">Substaff</span>
          </div>

          {/* Glass card */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl shadow-2xl shadow-black/40 p-8">
            <h1 className="text-2xl font-semibold text-white tracking-tight">
              {mode === "sign_in" ? "Sign in to Substaff" : "Create your account"}
            </h1>
            <p className="mt-1.5 text-sm text-white/40">
              {mode === "sign_in"
                ? "Use your email and password to continue."
                : "Create an account to get started."}
            </p>

            <form
              className="mt-6 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                mutation.mutate();
              }}
            >
              {mode === "sign_up" && (
                <div>
                  <label className="text-xs font-medium text-white/40 mb-1.5 block">Name</label>
                  <input
                    className={inputClasses}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    autoFocus
                  />
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-white/40 mb-1.5 block">Email</label>
                <input
                  className={inputClasses}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  autoFocus={mode === "sign_in"}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-white/40 mb-1.5 block">Password</label>
                <input
                  className={inputClasses}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === "sign_in" ? "current-password" : "new-password"}
                />
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <Button type="submit" disabled={!canSubmit || mutation.isPending} className="w-full h-11 text-sm font-medium">
                {mutation.isPending
                  ? "Working..."
                  : mode === "sign_in"
                    ? "Sign In"
                    : "Create Account"}
              </Button>
            </form>

            <div className="mt-5 text-sm text-white/40">
              {mode === "sign_in" ? "Need an account?" : "Already have an account?"}{" "}
              <button
                type="button"
                className="font-medium text-white/70 hover:text-white underline underline-offset-2 transition-colors"
                onClick={() => {
                  setError(null);
                  setMode(mode === "sign_in" ? "sign_up" : "sign_in");
                }}
              >
                {mode === "sign_in" ? "Create one" : "Sign in"}
              </button>
            </div>
          </div>

          {/* Footer */}
          <p className="mt-6 text-center text-xs text-white/30">
            Autonomous workforce management
          </p>
        </div>
      </div>
    </div>
  );
}
