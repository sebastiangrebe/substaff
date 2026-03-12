import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { companiesApi } from "../api/companies";
import { goalsApi } from "../api/goals";
import { agentsApi } from "../api/agents";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { Dialog, DialogPortal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "../lib/utils";
import { getUIAdapter } from "../adapters";
import { defaultCreateValues } from "./agent-config-defaults";
import { HeroAnimation } from "./HeroAnimation";
import {
  Building2,
  Bot,
  Code,
  ListTodo,
  Rocket,
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  X,
  Wallet,
} from "lucide-react";

type Step = 1 | 2 | 3 | 4;

const DEFAULT_TASK_DESCRIPTION = `Introduce yourself, explore your workspace, and prepare a brief summary of what you can help with. Then suggest what the team should work on first.`;

export function OnboardingWizard() {
  const { onboardingOpen, onboardingOptions, onboardingRequired, closeOnboarding, setOnboardingRequired } = useDialog();
  const { selectedCompanyId, companies, setSelectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const initialStep = onboardingOptions.initialStep ?? 1;
  const existingCompanyId = onboardingOptions.companyId;

  const [step, setStep] = useState<Step>(initialStep);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1
  const [companyName, setCompanyName] = useState("");
  const [companyGoal, setCompanyGoal] = useState("");

  // Step 2
  const [agentName, setAgentName] = useState("CEO");

  // Step 3
  const [taskTitle, setTaskTitle] = useState("Introduce yourself and get set up");
  const [taskDescription, setTaskDescription] = useState(
    DEFAULT_TASK_DESCRIPTION
  );

  // Auto-grow textarea for task description
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoResizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, []);

  // Created entity IDs — pre-populate from existing company when skipping step 1
  const [createdCompanyId, setCreatedCompanyId] = useState<string | null>(
    existingCompanyId ?? null
  );
  const [createdCompanyPrefix, setCreatedCompanyPrefix] = useState<
    string | null
  >(null);
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);
  const [createdIssueRef, setCreatedIssueRef] = useState<string | null>(null);

  // Sync step and company when onboarding opens with options.
  // Keep this independent from company-list refreshes so Step 1 completion
  // doesn't get reset after creating a company.
  useEffect(() => {
    if (!onboardingOpen) return;
    const cId = onboardingOptions.companyId ?? null;
    setStep(onboardingOptions.initialStep ?? 1);
    setCreatedCompanyId(cId);
    setCreatedCompanyPrefix(null);
  }, [
    onboardingOpen,
    onboardingOptions.companyId,
    onboardingOptions.initialStep
  ]);

  // Backfill issue prefix for an existing company once companies are loaded.
  useEffect(() => {
    if (!onboardingOpen || !createdCompanyId || createdCompanyPrefix) return;
    const company = companies.find((c) => c.id === createdCompanyId);
    if (company) setCreatedCompanyPrefix(company.issuePrefix);
  }, [onboardingOpen, createdCompanyId, createdCompanyPrefix, companies]);

  // Resize textarea when step 3 is shown or description changes
  useEffect(() => {
    if (step === 3) autoResizeTextarea();
  }, [step, taskDescription, autoResizeTextarea]);

  function reset() {
    setStep(1);
    setLoading(false);
    setError(null);
    setCompanyName("");
    setCompanyGoal("");
    setAgentName("CEO");
    setTaskTitle("Create your CEO HEARTBEAT.md");
    setTaskDescription(DEFAULT_TASK_DESCRIPTION);
    setCreatedCompanyId(null);
    setCreatedCompanyPrefix(null);
    setCreatedAgentId(null);
    setCreatedIssueRef(null);
  }

  function handleClose() {
    reset();
    closeOnboarding();
  }

  function buildAdapterConfig(): Record<string, unknown> {
    const adapter = getUIAdapter("blaxel_sandbox");
    return adapter.buildAdapterConfig({
      ...defaultCreateValues,
      adapterType: "blaxel_sandbox",
      cwd: "",
      model: "",
      command: "",
      args: "",
      url: "",
      dangerouslySkipPermissions: defaultCreateValues.dangerouslySkipPermissions,
      dangerouslyBypassSandbox: defaultCreateValues.dangerouslyBypassSandbox,
    });
  }

  async function handleStep1Next() {
    setLoading(true);
    setError(null);
    try {
      const company = await companiesApi.create({ name: companyName.trim() });
      setCreatedCompanyId(company.id);
      setCreatedCompanyPrefix(company.issuePrefix);
      setSelectedCompanyId(company.id);
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });

      if (companyGoal.trim()) {
        await goalsApi.create(company.id, {
          title: companyGoal.trim(),
          level: "company",
          status: "active"
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.goals.list(company.id)
        });
      }

      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create company");
    } finally {
      setLoading(false);
    }
  }

  async function handleStep2Next() {
    if (!createdCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const agent = await agentsApi.create(createdCompanyId, {
        name: agentName.trim(),
        role: "ceo",
        adapterType: "blaxel_sandbox",
        adapterConfig: buildAdapterConfig(),
        runtimeConfig: {
          heartbeat: {
            enabled: true,
            intervalSec: 3600,
            wakeOnDemand: true,
            cooldownSec: 10,
            maxConcurrentRuns: 1
          }
        }
      });
      setCreatedAgentId(agent.id);
      queryClient.invalidateQueries({
        queryKey: queryKeys.agents.list(createdCompanyId)
      });
      // Company + agent exist — onboarding is no longer mandatory
      setOnboardingRequired(false);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
    } finally {
      setLoading(false);
    }
  }

  async function handleStep3Next() {
    if (!createdCompanyId || !createdAgentId) return;
    setLoading(true);
    setError(null);
    try {
      const issue = await issuesApi.create(createdCompanyId, {
        title: taskTitle.trim(),
        ...(taskDescription.trim()
          ? { description: taskDescription.trim() }
          : {}),
        assigneeAgentId: createdAgentId,
        status: "todo"
      });
      setCreatedIssueRef(issue.identifier ?? issue.id);
      queryClient.invalidateQueries({
        queryKey: queryKeys.issues.list(createdCompanyId)
      });
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setLoading(false);
    }
  }

  async function handleLaunch() {
    if (!createdAgentId) return;
    setLoading(true);
    setError(null);
    setLoading(false);
    reset();
    closeOnboarding();
    if (createdCompanyPrefix && createdIssueRef) {
      navigate(`/${createdCompanyPrefix}/issues/${createdIssueRef}`);
      return;
    }
    if (createdCompanyPrefix) {
      navigate(`/${createdCompanyPrefix}/dashboard`);
      return;
    }
    navigate("/dashboard");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (step === 1 && companyName.trim()) handleStep1Next();
      else if (step === 2 && agentName.trim()) handleStep2Next();
      else if (step === 3 && taskTitle.trim()) handleStep3Next();
      else if (step === 4) handleLaunch();
    }
  }

  if (!onboardingOpen) return null;

  return (
    <Dialog
      open={onboardingOpen}
      onOpenChange={(open) => {
        if (!open && !onboardingRequired) handleClose();
      }}
    >
      <DialogPortal>
        <div className="fixed inset-0 z-50">
          {/* Full-screen animated background */}
          <HeroAnimation />

          {/* Content overlay */}
          <div className="relative z-10 flex min-h-full items-center justify-center overflow-y-auto px-4 py-12" onKeyDown={handleKeyDown}>
            <div className="w-full max-w-md">
              {/* Logo + progress + close */}
              <div className="flex items-center gap-2.5 mb-8">
                <img src="/logo.svg" alt="Substaff" className="h-7 w-7" />
                <span className="text-base font-semibold text-white/90 tracking-tight">Get Started</span>
                <span className="text-sm text-white/30 ml-1">Step {step} of 4</span>
                <div className="flex items-center gap-1.5 ml-auto">
                  {[1, 2, 3, 4].map((s) => (
                    <div
                      key={s}
                      className={cn(
                        "h-1.5 w-6 rounded-full transition-colors",
                        s < step
                          ? "bg-green-400"
                          : s === step
                            ? "bg-white"
                            : "bg-white/15"
                      )}
                    />
                  ))}
                </div>
                {!onboardingRequired && (
                  <button
                    onClick={handleClose}
                    className="ml-3 rounded-full p-1.5 text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors"
                  >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                  </button>
                )}
              </div>

              {/* Glass card */}
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl shadow-2xl shadow-black/40 p-8">

              {/* Step content */}
              {step === 1 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="h-10 w-10 rounded-xl bg-white/[0.06] flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-white/50" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">Name your company</h3>
                      <p className="text-xs text-white/40">
                        This is the organization your agents will work for.
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-white/40 mb-1.5 block">
                      Company name
                    </label>
                    <input
                      className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 placeholder:text-white/20 transition-colors"
                      placeholder="Acme Corp"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-white/40 mb-1.5 block">
                      Mission / goal (optional)
                    </label>
                    <textarea
                      className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 placeholder:text-white/20 transition-colors resize-none min-h-[60px]"
                      placeholder="What is this company trying to achieve?"
                      value={companyGoal}
                      onChange={(e) => setCompanyGoal(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="h-10 w-10 rounded-xl bg-white/[0.06] flex items-center justify-center">
                      <Bot className="h-5 w-5 text-white/50" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">Your CEO agent</h3>
                      <p className="text-xs text-white/40">
                        We'll create a CEO agent that manages your company.
                        It runs in a secure cloud sandbox.
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-white/40 mb-1.5 block">
                      Agent name
                    </label>
                    <input
                      className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 placeholder:text-white/20 transition-colors"
                      placeholder="CEO"
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value)}
                      autoFocus
                    />
                  </div>

                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Code className="h-4 w-4 text-white/40" />
                      <span className="text-sm font-medium text-white/80">E2B Sandbox</span>
                      <span className="text-[10px] bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded-full font-medium">
                        Cloud
                      </span>
                    </div>
                    <p className="text-xs text-white/35">
                      Secure, isolated cloud sandbox with its own filesystem. No local setup needed.
                    </p>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="h-10 w-10 rounded-xl bg-white/[0.06] flex items-center justify-center">
                      <ListTodo className="h-5 w-5 text-white/50" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">Give it something to do</h3>
                      <p className="text-xs text-white/40">
                        Give your agent a small task to start with — a bug fix,
                        a research question, writing a script.
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-white/40 mb-1.5 block">
                      Task title
                    </label>
                    <input
                      className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 placeholder:text-white/20 transition-colors"
                      placeholder="e.g. Research competitor pricing"
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-white/40 mb-1.5 block">
                      Description (optional)
                    </label>
                    <textarea
                      ref={textareaRef}
                      className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 placeholder:text-white/20 transition-colors resize-none min-h-[120px] max-h-[300px] overflow-y-auto"
                      placeholder="Add more detail about what the agent should do..."
                      value={taskDescription}
                      onChange={(e) => setTaskDescription(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="h-10 w-10 rounded-xl bg-white/[0.06] flex items-center justify-center">
                      <Rocket className="h-5 w-5 text-white/50" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">Ready to launch</h3>
                      <p className="text-xs text-white/40">
                        Everything is set up. Your assigned task already woke
                        the agent, so you can jump straight to the issue.
                      </p>
                    </div>
                  </div>
                  <div className="border border-white/[0.06] divide-y divide-white/[0.06] rounded-xl overflow-hidden">
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <Building2 className="h-4 w-4 text-white/40 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {companyName}
                        </p>
                        <p className="text-xs text-white/40">Company</p>
                      </div>
                      <Check className="h-4 w-4 text-green-400 shrink-0" />
                    </div>
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <Bot className="h-4 w-4 text-white/40 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {agentName}
                        </p>
                        <p className="text-xs text-white/40">
                          {getUIAdapter("blaxel_sandbox").label}
                        </p>
                      </div>
                      <Check className="h-4 w-4 text-green-400 shrink-0" />
                    </div>
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <ListTodo className="h-4 w-4 text-white/40 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {taskTitle}
                        </p>
                        <p className="text-xs text-white/40">Task</p>
                      </div>
                      <Check className="h-4 w-4 text-green-400 shrink-0" />
                    </div>
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <Wallet className="h-4 w-4 text-yellow-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white">Add credits</p>
                        <p className="text-xs text-white/40">
                          Agents need credits to run. Top up on the Billing page.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          closeOnboarding();
                          navigate("/billing");
                        }}
                      >
                        Top up
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="mt-3">
                  <p className="text-xs text-red-400">{error}</p>
                </div>
              )}

              {/* Footer navigation */}
              <div className="flex items-center justify-between mt-8">
                <div>
                  {step > 1 && step > (onboardingOptions.initialStep ?? 1) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setStep((step - 1) as Step)}
                      disabled={loading}
                    >
                      <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                      Back
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {step === 1 && (
                    <Button
                      size="sm"
                      disabled={!companyName.trim() || loading}
                      onClick={handleStep1Next}
                    >
                      {loading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 mr-1" />
                      )}
                      {loading ? "Creating..." : "Next"}
                    </Button>
                  )}
                  {step === 2 && (
                    <Button
                      size="sm"
                      disabled={
                        !agentName.trim() || loading
                      }
                      onClick={handleStep2Next}
                    >
                      {loading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 mr-1" />
                      )}
                      {loading ? "Creating..." : "Next"}
                    </Button>
                  )}
                  {step === 3 && (
                    <Button
                      size="sm"
                      disabled={!taskTitle.trim() || loading}
                      onClick={handleStep3Next}
                    >
                      {loading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 mr-1" />
                      )}
                      {loading ? "Creating..." : "Next"}
                    </Button>
                  )}
                  {step === 4 && (
                    <Button size="sm" disabled={loading} onClick={handleLaunch}>
                      {loading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 mr-1" />
                      )}
                      {loading ? "Opening..." : "Go to your dashboard"}
                    </Button>
                  )}
                </div>
              </div>
              </div>{/* end glass card */}

              {/* Footer */}
              <p className="mt-6 text-center text-xs text-white/30">
                Autonomous workforce management
              </p>
            </div>
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  );
}
