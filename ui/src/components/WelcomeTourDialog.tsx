import { useEffect, useState, useImperativeHandle, forwardRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDialog } from "../context/DialogContext";
import { useTour } from "./Tour";
import {
  Compass,
  Target,
  Plug,
  Wallet,
  ArrowRight,
  X,
} from "lucide-react";

const WELCOME_SHOWN_KEY = "substaff-welcome-shown";

export interface WelcomeTourDialogHandle {
  showWelcome: () => void;
}

export const WelcomeTourDialog = forwardRef<WelcomeTourDialogHandle>(
  function WelcomeTourDialog(_props, ref) {
    const { onboardingOpen } = useDialog();
    const { startTour, isActive } = useTour();

    const [welcomeOpen, setWelcomeOpen] = useState(false);
    const [summaryOpen, setSummaryOpen] = useState(false);
    const [waitingForTour, setWaitingForTour] = useState(false);

    // Detect onboarding close → show welcome (first time only)
    const [wasOnboarding, setWasOnboarding] = useState(false);

    useEffect(() => {
      if (onboardingOpen) setWasOnboarding(true);
    }, [onboardingOpen]);

    // Also detect onboarding completion when Layout/WelcomeTourDialog wasn't
    // mounted during onboarding (new signup flow: onboarding runs at "/" before
    // Layout mounts at "/:companyPrefix/dashboard").
    useEffect(() => {
      try {
        if (sessionStorage.getItem("substaff-onboarding-just-finished") === "true") {
          sessionStorage.removeItem("substaff-onboarding-just-finished");
          setWasOnboarding(true);
        }
      } catch { /* ignore */ }
    }, []);

    useEffect(() => {
      if (!wasOnboarding || onboardingOpen || welcomeOpen || summaryOpen) return;
      try {
        if (localStorage.getItem(WELCOME_SHOWN_KEY) === "true") return;
      } catch { /* ignore */ }
      const t = setTimeout(() => setWelcomeOpen(true), 400);
      return () => clearTimeout(t);
    }, [wasOnboarding, onboardingOpen, welcomeOpen, summaryOpen]);

    // Show summary when tour finishes
    const [tourWasActive, setTourWasActive] = useState(false);

    useEffect(() => {
      if (waitingForTour && isActive) setTourWasActive(true);
    }, [waitingForTour, isActive]);

    useEffect(() => {
      if (waitingForTour && tourWasActive && !isActive) {
        setWaitingForTour(false);
        setTourWasActive(false);
        setSummaryOpen(true);
      }
    }, [waitingForTour, tourWasActive, isActive]);

    function markShown() {
      try { localStorage.setItem(WELCOME_SHOWN_KEY, "true"); } catch { /* */ }
    }

    function handleStartTour() {
      markShown();
      setWelcomeOpen(false);
      setWaitingForTour(true);
      setTimeout(() => startTour(), 300);
    }

    function handleSkipTour() {
      markShown();
      setWelcomeOpen(false);
      setTimeout(() => setSummaryOpen(true), 200);
    }

    function handleDone() {
      setSummaryOpen(false);
    }

    useImperativeHandle(ref, () => ({
      showWelcome: () => setWelcomeOpen(true),
    }), []);

    return (
      <>
        {/* ── Welcome dialog ── */}
        <Dialog open={welcomeOpen}>
          <DialogContent showCloseButton={false} className="sm:max-w-[420px] p-0 gap-0 overflow-hidden">
            {/* Close button */}
            <button
              onClick={handleSkipTour}
              className="absolute top-4 right-4 z-10 rounded-full p-1.5 text-muted-foreground/60 hover:text-foreground hover:bg-accent transition-colors"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button>

            {/* Hero section */}
            <div className="relative px-8 pt-10 pb-6 text-center">
              {/* Subtle gradient accent behind icon */}
              <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-primary/[0.06] to-transparent pointer-events-none" />

              <div className="relative">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
                  <img src="/logo.svg" alt="Substaff" className="h-7 w-7" />
                </div>
                <DialogHeader className="space-y-2">
                  <DialogTitle className="text-center text-lg">
                    Welcome to your workspace
                  </DialogTitle>
                  <DialogDescription className="text-center text-sm leading-relaxed max-w-[280px] mx-auto">
                    Your company and team are ready. Take a quick tour to learn where everything is.
                  </DialogDescription>
                </DialogHeader>
              </div>
            </div>

            {/* Actions */}
            <div className="px-8 pb-8 pt-2 flex flex-col gap-2.5">
              <Button size="lg" className="w-full" onClick={handleStartTour}>
                <Compass className="h-4 w-4 mr-2" />
                Take the tour
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                onClick={handleSkipTour}
              >
                Skip for now
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Summary dialog ── */}
        <Dialog open={summaryOpen} onOpenChange={(open) => { if (!open) handleDone(); }}>
          <DialogContent showCloseButton className="sm:max-w-[440px] p-0 gap-0 overflow-hidden">
            {/* Hero section */}
            <div className="relative px-8 pt-10 pb-4 text-center">
              <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-green-500/[0.06] to-transparent pointer-events-none" />

              <div className="relative">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-500/10 ring-1 ring-green-500/20">
                  <svg className="h-7 w-7 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
                <DialogHeader className="space-y-2">
                  <DialogTitle className="text-center text-lg">
                    You're all set!
                  </DialogTitle>
                  <DialogDescription className="text-center text-sm leading-relaxed max-w-[300px] mx-auto">
                    Here are a few things to do next to get the most out of your AI team.
                  </DialogDescription>
                </DialogHeader>
              </div>
            </div>

            {/* Next steps */}
            <div className="px-6 pb-2">
              <div className="space-y-1">
                <NextStepRow
                  icon={<Plug className="h-4 w-4" />}
                  iconBg="bg-blue-500/10 text-blue-500"
                  title="Add integrations"
                  description="Connect GitHub, Slack, or Linear so your agents can work with your tools."
                />
                <NextStepRow
                  icon={<Target className="h-4 w-4" />}
                  iconBg="bg-amber-500/10 text-amber-500"
                  title="Create goals"
                  description="Set objectives and your CEO will pick them up automatically."
                />
                <NextStepRow
                  icon={<Wallet className="h-4 w-4" />}
                  iconBg="bg-emerald-500/10 text-emerald-500"
                  title="Top up credits"
                  description="Agents need credits to run. Add some on the Billing page to get started."
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 pt-4">
              <Button size="lg" className="w-full" onClick={handleDone}>
                Get started
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  },
);

function NextStepRow({
  icon,
  iconBg,
  title,
  description,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg p-3 transition-colors hover:bg-accent/50">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
        {icon}
      </div>
      <div className="min-w-0 pt-0.5">
        <p className="text-sm font-medium leading-none">{title}</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
