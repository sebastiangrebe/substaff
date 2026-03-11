import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@/lib/router";
import { accessApi } from "../api/access";
import { authApi } from "../api/auth";
import { healthApi } from "../api/health";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { HeroAnimation } from "@/components/HeroAnimation";
import type { AgentAdapterType, JoinRequest } from "@substaff/shared";

type JoinType = "human" | "agent";

function dateTime(value: string) {
  return new Date(value).toLocaleString();
}

function readNestedString(value: unknown, path: string[]): string | null {
  let current: unknown = value;
  for (const segment of path) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" && current.trim().length > 0 ? current : null;
}

export function InviteLandingPage() {
  const queryClient = useQueryClient();
  const params = useParams();
  const token = (params.token ?? "").trim();
  const [joinType, setJoinType] = useState<JoinType>("human");
  const [agentName, setAgentName] = useState("");
  const adapterType: AgentAdapterType = "e2b_sandbox";
  const [capabilities, setCapabilities] = useState("");
  const [result, setResult] = useState<{ kind: "bootstrap" | "join"; payload: unknown } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => healthApi.get(),
    retry: false,
  });
  const sessionQuery = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });
  const inviteQuery = useQuery({
    queryKey: queryKeys.access.invite(token),
    queryFn: () => accessApi.getInvite(token),
    enabled: token.length > 0,
    retry: false,
  });

  const invite = inviteQuery.data;
  const allowedJoinTypes = invite?.allowedJoinTypes ?? "both";
  const availableJoinTypes = useMemo(() => {
    if (invite?.inviteType === "bootstrap_ceo") return ["human"] as JoinType[];
    if (allowedJoinTypes === "both") return ["human", "agent"] as JoinType[];
    return [allowedJoinTypes] as JoinType[];
  }, [invite?.inviteType, allowedJoinTypes]);

  useEffect(() => {
    if (!availableJoinTypes.includes(joinType)) {
      setJoinType(availableJoinTypes[0] ?? "human");
    }
  }, [availableJoinTypes, joinType]);

  const requiresAuthForHuman =
    joinType === "human" &&
    healthQuery.data?.deploymentMode === "authenticated" &&
    !sessionQuery.data;

  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!invite) throw new Error("Invite not found");
      if (invite.inviteType === "bootstrap_ceo") {
        return accessApi.acceptInvite(token, { requestType: "human" });
      }
      if (joinType === "human") {
        return accessApi.acceptInvite(token, { requestType: "human" });
      }
      return accessApi.acceptInvite(token, {
        requestType: "agent",
        agentName: agentName.trim(),
        adapterType,
        capabilities: capabilities.trim() || null,
      });
    },
    onSuccess: async (payload) => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      const asBootstrap =
        payload && typeof payload === "object" && "bootstrapAccepted" in (payload as Record<string, unknown>);
      setResult({ kind: asBootstrap ? "bootstrap" : "join", payload });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to accept invite");
    },
  });

  /* ── Full-screen layout with animation background + glass card ── */
  function PageShell({ children }: { children: React.ReactNode }) {
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
              {children}
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

  if (!token) {
    return (
      <PageShell>
        <p className="text-sm text-red-400">Invalid invite token.</p>
      </PageShell>
    );
  }

  if (inviteQuery.isLoading || healthQuery.isLoading || sessionQuery.isLoading) {
    return (
      <PageShell>
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
          <p className="text-sm text-white/50">Loading invite...</p>
        </div>
      </PageShell>
    );
  }

  if (inviteQuery.error || !invite) {
    return (
      <PageShell>
        <h1 className="text-xl font-semibold text-white">Invite not available</h1>
        <p className="mt-2 text-sm text-white/50">
          This invite may be expired, revoked, or already used.
        </p>
      </PageShell>
    );
  }

  if (result?.kind === "bootstrap") {
    return (
      <PageShell>
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-full bg-green-500/15 flex items-center justify-center">
            <svg className="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Bootstrap complete</h1>
            <p className="text-sm text-white/50">Instance admin configured.</p>
          </div>
        </div>
        <Button asChild className="w-full">
          <Link to="/">Open board</Link>
        </Button>
      </PageShell>
    );
  }

  if (result?.kind === "join") {
    const payload = result.payload as JoinRequest & {
      claimSecret?: string;
      claimApiKeyPath?: string;
      onboarding?: Record<string, unknown>;
      diagnostics?: Array<{
        code: string;
        level: "info" | "warn";
        message: string;
        hint?: string;
      }>;
    };
    const claimSecret = typeof payload.claimSecret === "string" ? payload.claimSecret : null;
    const claimApiKeyPath = typeof payload.claimApiKeyPath === "string" ? payload.claimApiKeyPath : null;
    const onboardingSkillUrl = readNestedString(payload.onboarding, ["skill", "url"]);
    const onboardingSkillPath = readNestedString(payload.onboarding, ["skill", "path"]);
    const onboardingInstallPath = readNestedString(payload.onboarding, ["skill", "installPath"]);
    const onboardingTextUrl = readNestedString(payload.onboarding, ["textInstructions", "url"]);
    const onboardingTextPath = readNestedString(payload.onboarding, ["textInstructions", "path"]);
    const diagnostics = Array.isArray(payload.diagnostics) ? payload.diagnostics : [];
    return (
      <PageShell>
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-full bg-indigo-500/15 flex items-center justify-center">
            <svg className="h-5 w-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Join request submitted</h1>
            <p className="text-sm text-white/50">Pending admin approval.</p>
          </div>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-xs text-white/40">
          Request ID: <span className="font-mono text-white/60">{payload.id}</span>
        </div>
        {claimSecret && claimApiKeyPath && (
          <div className="mt-3 space-y-1 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-xs text-white/40">
            <p className="font-medium text-white/80">One-time claim secret (save now)</p>
            <p className="font-mono break-all text-white/60">{claimSecret}</p>
            <p className="font-mono break-all text-white/50">POST {claimApiKeyPath}</p>
          </div>
        )}
        {(onboardingSkillUrl || onboardingSkillPath || onboardingInstallPath) && (
          <div className="mt-3 space-y-1 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-xs text-white/40">
            <p className="font-medium text-white/80">Substaff skill bootstrap</p>
            {onboardingSkillUrl && <p className="font-mono break-all">GET {onboardingSkillUrl}</p>}
            {!onboardingSkillUrl && onboardingSkillPath && <p className="font-mono break-all">GET {onboardingSkillPath}</p>}
            {onboardingInstallPath && <p className="font-mono break-all">Install to {onboardingInstallPath}</p>}
          </div>
        )}
        {(onboardingTextUrl || onboardingTextPath) && (
          <div className="mt-3 space-y-1 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-xs text-white/40">
            <p className="font-medium text-white/80">Agent-readable onboarding text</p>
            {onboardingTextUrl && <p className="font-mono break-all">GET {onboardingTextUrl}</p>}
            {!onboardingTextUrl && onboardingTextPath && <p className="font-mono break-all">GET {onboardingTextPath}</p>}
          </div>
        )}
        {diagnostics.length > 0 && (
          <div className="mt-3 space-y-1 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-xs text-white/40">
            <p className="font-medium text-white/80">Connectivity diagnostics</p>
            {diagnostics.map((diag, idx) => (
              <div key={`${diag.code}:${idx}`} className="space-y-0.5">
                <p className={diag.level === "warn" ? "text-amber-400" : undefined}>
                  [{diag.level}] {diag.message}
                </p>
                {diag.hint && <p className="font-mono break-all">{diag.hint}</p>}
              </div>
            ))}
          </div>
        )}
      </PageShell>
    );
  }

  return (
    <PageShell>
      <h1 className="text-2xl font-semibold text-white tracking-tight">
        {invite.inviteType === "bootstrap_ceo" ? "Bootstrap your instance" : "Join this company"}
      </h1>
      <p className="mt-1.5 text-sm text-white/40">Invite expires {dateTime(invite.expiresAt)}.</p>

      {invite.inviteType !== "bootstrap_ceo" && availableJoinTypes.length > 1 && (
        <div className="mt-6 flex rounded-lg border border-white/[0.08] bg-white/[0.03] p-1">
          {availableJoinTypes.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setJoinType(type)}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                joinType === type
                  ? "bg-white/10 text-white shadow-sm"
                  : "text-white/40 hover:text-white/60"
              }`}
            >
              Join as {type}
            </button>
          ))}
        </div>
      )}

      {joinType === "agent" && invite.inviteType !== "bootstrap_ceo" && (
        <div className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-white/40 mb-1.5 block">Agent name</label>
            <input
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 placeholder:text-white/20 transition-colors"
              value={agentName}
              onChange={(event) => setAgentName(event.target.value)}
              placeholder="e.g. my-coding-agent"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-white/40 mb-1.5 block">Capabilities (optional)</label>
            <textarea
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 placeholder:text-white/20 transition-colors resize-none"
              rows={3}
              value={capabilities}
              onChange={(event) => setCapabilities(event.target.value)}
              placeholder="Describe what this agent can do..."
            />
          </div>
        </div>
      )}

      {requiresAuthForHuman && (
        <div className="mt-5 rounded-lg border border-white/[0.06] bg-white/[0.03] p-4 text-sm text-white/50">
          Sign in or create an account before submitting a human join request.
          <div className="mt-3">
            <Button asChild size="sm" variant="outline">
              <Link to={`/auth?next=${encodeURIComponent(`/invite/${token}`)}`}>Sign in / Create account</Link>
            </Button>
          </div>
        </div>
      )}

      {error && <p className="mt-4 text-xs text-red-400">{error}</p>}

      <Button
        className="mt-6 w-full h-11 text-sm font-medium"
        disabled={
          acceptMutation.isPending ||
          (joinType === "agent" && invite.inviteType !== "bootstrap_ceo" && agentName.trim().length === 0) ||
          requiresAuthForHuman
        }
        onClick={() => acceptMutation.mutate()}
      >
        {acceptMutation.isPending
          ? "Submitting..."
          : invite.inviteType === "bootstrap_ceo"
            ? "Accept bootstrap invite"
            : "Submit join request"}
      </Button>
    </PageShell>
  );
}
