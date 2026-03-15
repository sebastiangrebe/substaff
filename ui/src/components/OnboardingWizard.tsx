import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { companiesApi } from "../api/companies";
import { goalsApi } from "../api/goals";
import { agentsApi } from "../api/agents";
import { issuesApi } from "../api/issues";
import { templatesApi, type OrgTemplateDetail, type ApplyTemplateResult } from "../api/templates";
import { queryKeys } from "../lib/queryKeys";
import { Dialog, DialogPortal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "../lib/utils";
import { getUIAdapter } from "../adapters";
import { defaultCreateValues } from "./agent-config-defaults";
import { HeroAnimation } from "./HeroAnimation";
import { TemplatePicker } from "./onboarding/TemplatePicker";
import { TemplatePreview } from "./onboarding/TemplatePreview";
import { TeamCustomizer, type TeamEdit } from "./onboarding/TeamCustomizer";
import { WorkingHoursSetup, DEFAULT_WORKING_HOURS } from "./onboarding/WorkingHoursSetup";
import type { WorkingHoursConfig } from "@substaff/shared";
import {
  Building2,
  Bot,
  Clock,
  ListTodo,
  Rocket,
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  X,
  Wallet,
  Users,
} from "lucide-react";

type Step = 1 | 2 | 3 | 4 | 5 | 6;
const TOTAL_STEPS = 6;

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

  // Step 2 — Template selection
  const [selectedTemplate, setSelectedTemplate] = useState<OrgTemplateDetail | null>(null);
  const [skippedTemplate, setSkippedTemplate] = useState(false);

  // Step 3 — Team customization (used when template selected)
  // Also used for CEO-only flow when template skipped
  const [agentName, setAgentName] = useState("CEO");
  const [teamEdits, setTeamEdits] = useState<TeamEdit[]>([]);

  // Step 4 — Working hours
  const [workingHours, setWorkingHours] = useState<WorkingHoursConfig>(DEFAULT_WORKING_HOURS);

  // Step 5 — Task
  const [taskTitle, setTaskTitle] = useState("Introduce yourself and get set up");
  const [taskDescription, setTaskDescription] = useState(DEFAULT_TASK_DESCRIPTION);

  // Created entity IDs
  const [createdCompanyId, setCreatedCompanyId] = useState<string | null>(existingCompanyId ?? null);
  const [createdCompanyPrefix, setCreatedCompanyPrefix] = useState<string | null>(null);
  const [createdAgents, setCreatedAgents] = useState<ApplyTemplateResult["agents"]>([]);
  const [createdIssueRef, setCreatedIssueRef] = useState<string | null>(null);

  // Auto-grow textarea for task description
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoResizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, []);

  // Sync step and company when onboarding opens
  useEffect(() => {
    if (!onboardingOpen) return;
    const cId = onboardingOptions.companyId ?? null;
    setStep(onboardingOptions.initialStep ?? 1);
    setCreatedCompanyId(cId);
    setCreatedCompanyPrefix(null);
  }, [onboardingOpen, onboardingOptions.companyId, onboardingOptions.initialStep]);

  // Backfill issue prefix for existing company
  useEffect(() => {
    if (!onboardingOpen || !createdCompanyId || createdCompanyPrefix) return;
    const company = companies.find((c) => c.id === createdCompanyId);
    if (company) setCreatedCompanyPrefix(company.issuePrefix);
  }, [onboardingOpen, createdCompanyId, createdCompanyPrefix, companies]);

  // Resize textarea on step 5
  useEffect(() => {
    if (step === 5) autoResizeTextarea();
  }, [step, taskDescription, autoResizeTextarea]);

  // Initialize team edits when template selected
  useEffect(() => {
    if (selectedTemplate) {
      setTeamEdits(
        selectedTemplate.nodes.map((n) => ({
          id: n.id,
          name: n.data.label,
          title: n.data.title,
          removed: false,
        }))
      );
      // Pre-fill bootstrap task if available
      if (selectedTemplate.bootstrapTask) {
        setTaskTitle(selectedTemplate.bootstrapTask.title);
        setTaskDescription(selectedTemplate.bootstrapTask.description);
      }
    }
  }, [selectedTemplate]);

  function reset() {
    setStep(1);
    setLoading(false);
    setError(null);
    setCompanyName("");
    setCompanyGoal("");
    setSelectedTemplate(null);
    setSkippedTemplate(false);
    setAgentName("CEO");
    setTeamEdits([]);
    setWorkingHours(DEFAULT_WORKING_HOURS);
    setTaskTitle("Introduce yourself and get set up");
    setTaskDescription(DEFAULT_TASK_DESCRIPTION);
    setCreatedCompanyId(null);
    setCreatedCompanyPrefix(null);
    setCreatedAgents([]);
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

  function handleStep1Next() {
    // Just advance — company creation is deferred to step 3
    setStep(2);
  }

  /** Create the company (and optional goal). Called once from handleStep3Next. */
  async function createCompany(): Promise<{ id: string; issuePrefix: string }> {
    // If company was already created (e.g. opened with existing companyId), skip
    if (createdCompanyId) {
      return { id: createdCompanyId, issuePrefix: createdCompanyPrefix ?? "" };
    }

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

    return { id: company.id, issuePrefix: company.issuePrefix };
  }

  function handleTemplateSelect(template: OrgTemplateDetail) {
    setSelectedTemplate(template);
    setSkippedTemplate(false);
  }

  function handleTemplateSkip() {
    setSelectedTemplate(null);
    setSkippedTemplate(true);
    setStep(3);
  }

  function handleStep2Next() {
    if (selectedTemplate) {
      setStep(3);
    }
  }

  async function handleStep3Next() {
    setLoading(true);
    setError(null);
    try {
      // Create company first (deferred from step 1)
      const company = await createCompany();
      const companyId = company.id;

      if (skippedTemplate) {
        // CEO-only flow (original behavior)
        const agent = await agentsApi.create(companyId, {
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
        setCreatedAgents([{ id: agent.id, name: agent.name, role: agent.role, title: agent.title ?? "", reportsTo: null }]);
      } else if (selectedTemplate) {
        // Apply template with agent creation
        const result = await templatesApi.apply(companyId, selectedTemplate.id, true);
        setCreatedAgents(result.agents);
      }

      queryClient.invalidateQueries({
        queryKey: queryKeys.agents.list(companyId)
      });
      setOnboardingRequired(false);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create company and team");
    } finally {
      setLoading(false);
    }
  }

  async function handleStep4Next() {
    if (!createdCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      // Save working hours to the company
      await companiesApi.update(createdCompanyId, { workingHours });
      queryClient.invalidateQueries({
        queryKey: queryKeys.companies.all,
      });
      setStep(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save working hours");
    } finally {
      setLoading(false);
    }
  }

  async function handleStep5Next() {
    if (!createdCompanyId || createdAgents.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      // Assign to the root agent (first agent with no reportsTo, or first agent)
      const rootAgent = createdAgents.find((a) => !a.reportsTo) ?? createdAgents[0];
      const issue = await issuesApi.create(createdCompanyId, {
        title: taskTitle.trim(),
        ...(taskDescription.trim() ? { description: taskDescription.trim() } : {}),
        assigneeAgentId: rootAgent.id,
        status: "todo"
      });
      setCreatedIssueRef(issue.identifier ?? issue.id);
      queryClient.invalidateQueries({
        queryKey: queryKeys.issues.list(createdCompanyId)
      });
      setStep(6);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setLoading(false);
    }
  }

  async function handleLaunch() {
    setLoading(false);
    reset();
    // Signal that onboarding just completed so WelcomeTourDialog can pick it up
    // even if it wasn't mounted during onboarding (Layout mounts after navigation).
    try { sessionStorage.setItem("substaff-onboarding-just-finished", "true"); } catch { /* */ }
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
      else if (step === 2 && selectedTemplate) handleStep2Next();
      else if (step === 3) handleStep3Next();
      else if (step === 4) handleStep4Next();
      else if (step === 5 && taskTitle.trim()) handleStep5Next();
      else if (step === 6) handleLaunch();
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
          <HeroAnimation />

          <div className="relative z-10 flex min-h-full items-center justify-center overflow-y-auto px-4 py-12" onKeyDown={handleKeyDown}>
            <div className={cn("w-full", step === 2 ? "max-w-lg" : "max-w-md")}>
              {/* Logo + progress + close */}
              <div className="flex items-center gap-2.5 mb-8">
                <img src="/logo.svg" alt="Substaff" className="h-7 w-7" />
                <span className="text-base font-semibold text-foreground tracking-tight">Get Started</span>
                <span className="text-sm text-muted-foreground ml-1">Step {step} of {TOTAL_STEPS}</span>
                <div className="flex items-center gap-1.5 ml-auto">
                  {[1, 2, 3, 4, 5, 6].map((s) => (
                    <div
                      key={s}
                      className={cn(
                        "h-1.5 w-6 rounded-full transition-colors",
                        s < step
                          ? "bg-green-400"
                          : s === step
                            ? "bg-primary"
                            : "bg-muted-foreground/20"
                      )}
                    />
                  ))}
                </div>
                {!onboardingRequired && (
                  <button
                    onClick={handleClose}
                    className="ml-3 rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                  </button>
                )}
              </div>

              {/* Glass card */}
              <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-xl shadow-2xl shadow-black/10 dark:shadow-black/40 p-8">

              {/* Step 1: Company name */}
              {step === 1 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">Name your company</h3>
                      <p className="text-xs text-muted-foreground">
                        This is the organization your agents will work for.
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      Company name
                    </label>
                    <input
                      className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring/30 placeholder:text-muted-foreground/50 transition-colors"
                      placeholder="Acme Corp"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      Mission / goal (optional)
                    </label>
                    <textarea
                      className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring/30 placeholder:text-muted-foreground/50 transition-colors resize-none min-h-[60px]"
                      placeholder="What is this company trying to achieve?"
                      value={companyGoal}
                      onChange={(e) => setCompanyGoal(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Step 2: Choose template */}
              {step === 2 && (
                <TemplatePicker
                  selectedSlug={selectedTemplate?.id ?? null}
                  onSelect={handleTemplateSelect}
                  onSkip={handleTemplateSkip}
                />
              )}

              {/* Step 3: Review team / CEO name */}
              {step === 3 && (
                <div className="space-y-5">
                  {skippedTemplate ? (
                    <>
                      <div className="flex items-center gap-3 mb-1">
                        <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                          <Bot className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground">Your CEO agent</h3>
                          <p className="text-xs text-muted-foreground">
                            We'll create a CEO agent that manages your company.
                          </p>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                          Agent name
                        </label>
                        <input
                          className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring/30 placeholder:text-muted-foreground/50 transition-colors"
                          placeholder="CEO"
                          value={agentName}
                          onChange={(e) => setAgentName(e.target.value)}
                          autoFocus
                        />
                      </div>
                    </>
                  ) : selectedTemplate ? (
                    <>
                      <div className="flex items-center gap-3 mb-1">
                        <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                          <Users className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground">Review your team</h3>
                          <p className="text-xs text-muted-foreground">
                            Customize agent names or remove roles you don't need.
                          </p>
                        </div>
                      </div>
                      <TemplatePreview template={selectedTemplate} />
                      <TeamCustomizer
                        template={selectedTemplate}
                        edits={teamEdits}
                        onChange={setTeamEdits}
                      />
                    </>
                  ) : null}
                </div>
              )}

              {/* Step 4: Working hours */}
              {step === 4 && (
                <WorkingHoursSetup value={workingHours} onChange={setWorkingHours} />
              )}

              {/* Step 5: First task */}
              {step === 5 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                      <ListTodo className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">Give them something to do</h3>
                      <p className="text-xs text-muted-foreground">
                        This task will be assigned to your {createdAgents.length > 1 ? "lead agent" : "CEO"}.
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      Task title
                    </label>
                    <input
                      className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring/30 placeholder:text-muted-foreground/50 transition-colors"
                      placeholder="e.g. Research competitor pricing"
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      Description (optional)
                    </label>
                    <textarea
                      ref={textareaRef}
                      className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring/30 placeholder:text-muted-foreground/50 transition-colors resize-none min-h-[120px] max-h-[300px] overflow-y-auto"
                      placeholder="Add more detail about what the agent should do..."
                      value={taskDescription}
                      onChange={(e) => setTaskDescription(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Step 6: Launch summary */}
              {step === 6 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                      <Rocket className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">Ready to launch</h3>
                      <p className="text-xs text-muted-foreground">
                        Everything is set up. Your assigned task already woke
                        the agent, so you can jump straight to the issue.
                      </p>
                    </div>
                  </div>
                  <div className="border border-border divide-y divide-border rounded-xl overflow-hidden">
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {companyName}
                        </p>
                        <p className="text-xs text-muted-foreground">Company</p>
                      </div>
                      <Check className="h-4 w-4 text-green-400 shrink-0" />
                    </div>
                    {createdAgents.length > 1 ? (
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {createdAgents.length} agents
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {createdAgents.map((a) => a.name).join(", ")}
                          </p>
                        </div>
                        <Check className="h-4 w-4 text-green-400 shrink-0" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {createdAgents[0]?.name ?? agentName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {getUIAdapter("blaxel_sandbox").label}
                          </p>
                        </div>
                        <Check className="h-4 w-4 text-green-400 shrink-0" />
                      </div>
                    )}
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <ListTodo className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {taskTitle}
                        </p>
                        <p className="text-xs text-muted-foreground">Task</p>
                      </div>
                      <Check className="h-4 w-4 text-green-400 shrink-0" />
                    </div>
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {workingHours.enabled ? "Working hours enabled" : "Working hours off"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {workingHours.enabled ? workingHours.timezone : "Agents can run anytime"}
                        </p>
                      </div>
                      <Check className="h-4 w-4 text-green-400 shrink-0" />
                    </div>
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <Wallet className="h-4 w-4 text-yellow-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">Add credits</p>
                        <p className="text-xs text-muted-foreground">
                          Agents need credits to run. Top up on the Billing page.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          closeOnboarding();
                          navigate(createdCompanyPrefix ? `/${createdCompanyPrefix}/billing` : "/billing");
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
                      className="text-muted-foreground"
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
                      disabled={!companyName.trim()}
                      onClick={handleStep1Next}
                    >
                      <ArrowRight className="h-3.5 w-3.5 mr-1" />
                      Next
                    </Button>
                  )}
                  {step === 2 && selectedTemplate && (
                    <Button
                      size="sm"
                      onClick={handleStep2Next}
                    >
                      <ArrowRight className="h-3.5 w-3.5 mr-1" />
                      Next
                    </Button>
                  )}
                  {step === 3 && (
                    <Button
                      size="sm"
                      disabled={loading || (skippedTemplate && !agentName.trim())}
                      onClick={handleStep3Next}
                    >
                      {loading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 mr-1" />
                      )}
                      {loading ? "Setting up..." : "Create company"}
                    </Button>
                  )}
                  {step === 4 && (
                    <Button
                      size="sm"
                      disabled={loading}
                      onClick={handleStep4Next}
                    >
                      {loading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 mr-1" />
                      )}
                      {loading ? "Saving..." : "Next"}
                    </Button>
                  )}
                  {step === 5 && (
                    <Button
                      size="sm"
                      disabled={!taskTitle.trim() || loading}
                      onClick={handleStep5Next}
                    >
                      {loading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 mr-1" />
                      )}
                      {loading ? "Creating..." : "Next"}
                    </Button>
                  )}
                  {step === 6 && (
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
              <p className="mt-6 text-center text-xs text-muted-foreground/60">
                Autonomous workforce management
              </p>
            </div>
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  );
}
