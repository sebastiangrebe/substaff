import { AnimatePresence, motion } from "motion/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "../lib/utils";

export interface TourStep {
  content: ReactNode;
  selectorId: string;
  width?: number;
  height?: number;
  position?: "top" | "bottom" | "left" | "right";
}

interface TourContextType {
  currentStep: number;
  totalSteps: number;
  nextStep: () => void;
  previousStep: () => void;
  endTour: () => void;
  isActive: boolean;
  startTour: () => void;
  setSteps: (steps: TourStep[]) => void;
  steps: TourStep[];
  isTourCompleted: boolean;
}

interface TourProviderProps {
  children: ReactNode;
  onComplete?: () => void;
  storageKey?: string;
}

const TourContext = createContext<TourContextType | null>(null);

const PADDING = 16;
const CONTENT_WIDTH = 300;
const CONTENT_HEIGHT = 200;

function getElementPosition(id: string) {
  const element = document.getElementById(id);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  // Use viewport-relative values directly since overlay is position: fixed
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function calculateContentPosition(
  elementPos: { top: number; left: number; width: number; height: number },
  position: "top" | "bottom" | "left" | "right" = "bottom",
) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = elementPos.left;
  let top = elementPos.top;

  switch (position) {
    case "top":
      top = elementPos.top - CONTENT_HEIGHT - PADDING;
      left = elementPos.left + elementPos.width / 2 - CONTENT_WIDTH / 2;
      break;
    case "bottom":
      top = elementPos.top + elementPos.height + PADDING;
      left = elementPos.left + elementPos.width / 2 - CONTENT_WIDTH / 2;
      break;
    case "left":
      left = elementPos.left - CONTENT_WIDTH - PADDING;
      top = elementPos.top + elementPos.height / 2 - CONTENT_HEIGHT / 2;
      break;
    case "right":
      left = elementPos.left + elementPos.width + PADDING;
      top = elementPos.top + elementPos.height / 2 - CONTENT_HEIGHT / 2;
      break;
  }

  return {
    top: Math.max(PADDING, Math.min(top, viewportHeight - CONTENT_HEIGHT - PADDING)),
    left: Math.max(PADDING, Math.min(left, viewportWidth - CONTENT_WIDTH - PADDING)),
    width: CONTENT_WIDTH,
    height: CONTENT_HEIGHT,
  };
}

export function TourProvider({
  children,
  onComplete,
  storageKey = "substaff-tour-completed",
}: TourProviderProps) {
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [currentStep, setCurrentStep] = useState(-1);
  const [elementPosition, setElementPosition] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const [isCompleted, setIsCompleted] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === "true";
    } catch {
      return false;
    }
  });

  // Recalculate position whenever the step changes
  useEffect(() => {
    if (currentStep < 0 || currentStep >= steps.length) return;

    const selectorId = steps[currentStep]?.selectorId ?? "";

    function measure() {
      const el = document.getElementById(selectorId);
      console.log("[Tour] step", currentStep, "selectorId", selectorId, "el", el);
      if (!el) return false;
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      const rect = el.getBoundingClientRect();
      console.log("[Tour] rect", { top: rect.top, left: rect.left, width: rect.width, height: rect.height });
      setElementPosition({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
      return true;
    }

    // Try immediately, then retry in case DOM isn't ready
    if (!measure()) {
      const timer = setTimeout(measure, 150);
      return () => clearTimeout(timer);
    }

    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [currentStep, steps]);

  const markCompleted = useCallback(() => {
    setIsCompleted(true);
    try {
      localStorage.setItem(storageKey, "true");
    } catch {
      // ignore storage errors
    }
  }, [storageKey]);

  const nextStep = useCallback(() => {
    setCurrentStep((prev) => {
      if (prev >= steps.length - 1) {
        return -1;
      }
      return prev + 1;
    });

    if (currentStep === steps.length - 1) {
      markCompleted();
      onComplete?.();
    }
  }, [steps.length, onComplete, currentStep, markCompleted]);

  const previousStep = useCallback(() => {
    setCurrentStep((prev) => (prev > 0 ? prev - 1 : prev));
  }, []);

  const endTour = useCallback(() => {
    setCurrentStep(-1);
    markCompleted();
  }, [markCompleted]);

  const startTour = useCallback(() => {
    setCurrentStep(0);
  }, []);

  // Close on Escape
  useEffect(() => {
    if (currentStep < 0) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") endTour();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentStep, endTour]);

  return (
    <TourContext.Provider
      value={{
        currentStep,
        totalSteps: steps.length,
        nextStep,
        previousStep,
        endTour,
        isActive: currentStep >= 0,
        startTour,
        setSteps,
        steps,
        isTourCompleted: isCompleted,
      }}
    >
      {children}
      <AnimatePresence>
        {currentStep >= 0 && elementPosition && (
          <>
            {/* Overlay — click-to-dismiss area behind the spotlight */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200]"
              onClick={endTour}
            />

            {/* Spotlight: box-shadow creates the overlay, border-radius matches naturally */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                position: "fixed",
                top: elementPosition.top - 4,
                left: elementPosition.left - 4,
                width: (steps[currentStep]?.width || elementPosition.width) + 8,
                height: (steps[currentStep]?.height || elementPosition.height) + 8,
                boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.5)",
              }}
              className="z-[200] rounded-lg border-2 border-primary/70 pointer-events-none"
            />

            {/* Content popover */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{
                opacity: 1,
                y: 0,
                top: calculateContentPosition(elementPosition, steps[currentStep]?.position).top,
                left: calculateContentPosition(elementPosition, steps[currentStep]?.position).left,
              }}
              transition={{
                duration: 0.5,
                ease: [0.16, 1, 0.3, 1],
                opacity: { duration: 0.3 },
              }}
              exit={{ opacity: 0, y: 10 }}
              style={{
                position: "fixed",
                width: calculateContentPosition(elementPosition, steps[currentStep]?.position).width,
              }}
              className="bg-background z-[202] rounded-lg border p-4 shadow-lg"
            >
              <div className="text-muted-foreground absolute right-4 top-4 text-xs">
                {currentStep + 1} / {steps.length}
              </div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={`tour-content-${currentStep}`}
                  initial={{ opacity: 0, scale: 0.95, filter: "blur(4px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, scale: 0.95, filter: "blur(4px)" }}
                  className="overflow-hidden"
                  transition={{ duration: 0.2 }}
                >
                  {steps[currentStep]?.content}
                </motion.div>
              </AnimatePresence>
              <div className="mt-4 flex items-center justify-between">
                <div className="flex gap-2">
                  {currentStep > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={previousStep}
                      className="text-xs"
                    >
                      Previous
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={endTour}
                    className="text-xs text-muted-foreground"
                  >
                    Skip
                  </Button>
                  <Button
                    size="sm"
                    onClick={nextStep}
                    className="text-xs"
                  >
                    {currentStep === steps.length - 1 ? "Done" : "Next"}
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </TourContext.Provider>
  );
}

export function useTour() {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error("useTour must be used within a TourProvider");
  }
  return context;
}
