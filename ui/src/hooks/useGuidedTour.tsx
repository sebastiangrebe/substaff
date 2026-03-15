import { useEffect } from "react";
import { useTour, type TourStep } from "../components/Tour";

/** DOM ids that tour steps target. Add these as id="..." attributes on the elements. */
export const TOUR_IDS = {
  NEW_TASK: "tour-new-task",
  HOME: "tour-home",
  MY_WORK: "tour-my-work",
  GOALS: "tour-goals",
  PROJECTS: "tour-projects",
  TASKS: "tour-tasks",
  TEAM: "tour-team",
  BUDGET: "tour-budget",
  FILES: "tour-files",
  INTEGRATIONS: "tour-integrations",
} as const;

const TOUR_STEPS: TourStep[] = [
  {
    selectorId: TOUR_IDS.NEW_TASK,
    position: "right",
    content: (
      <div>
        <p className="font-medium text-sm mb-1">Create tasks</p>
        <p className="text-xs text-muted-foreground">
          Click here to create a new task and assign it to a team member. They'll start working on it right away.
        </p>
      </div>
    ),
  },
  {
    selectorId: TOUR_IDS.HOME,
    position: "right",
    content: (
      <div>
        <p className="font-medium text-sm mb-1">Your dashboard</p>
        <p className="text-xs text-muted-foreground">
          See what's happening across your workspace — active tasks, team status, and goals at a glance.
        </p>
      </div>
    ),
  },
  {
    selectorId: TOUR_IDS.MY_WORK,
    position: "right",
    content: (
      <div>
        <p className="font-medium text-sm mb-1">My Work</p>
        <p className="text-xs text-muted-foreground">
          Tasks assigned to you and reviews that need your attention all show up here.
        </p>
      </div>
    ),
  },
  {
    selectorId: TOUR_IDS.GOALS,
    position: "right",
    content: (
      <div>
        <p className="font-medium text-sm mb-1">Goals</p>
        <p className="text-xs text-muted-foreground">
          Set high-level objectives for your CEO to target. Each goal can have multiple projects to achieve it.
        </p>
      </div>
    ),
  },
  {
    selectorId: TOUR_IDS.PROJECTS,
    position: "right",
    content: (
      <div>
        <p className="font-medium text-sm mb-1">Projects</p>
        <p className="text-xs text-muted-foreground">
          Projects break down goals into manageable pieces. Your CEO creates and manages them, and assigns tasks to the team.
        </p>
      </div>
    ),
  },
  {
    selectorId: TOUR_IDS.TASKS,
    position: "right",
    content: (
      <div>
        <p className="font-medium text-sm mb-1">All tasks</p>
        <p className="text-xs text-muted-foreground">
          The work that gets done. Tasks are assigned to team members — your CEO or the employees they hire.
        </p>
      </div>
    ),
  },
  {
    selectorId: TOUR_IDS.FILES,
    position: "right",
    content: (
      <div>
        <p className="font-medium text-sm mb-1">Files</p>
        <p className="text-xs text-muted-foreground">
          Browse files and artifacts created by your team. Everything your team produces is stored here.
        </p>
      </div>
    ),
  },
  {
    selectorId: TOUR_IDS.INTEGRATIONS,
    position: "right",
    content: (
      <div>
        <p className="font-medium text-sm mb-1">Integrations</p>
        <p className="text-xs text-muted-foreground">
          Connect external tools and services to your workspace. Extend what your team can do.
        </p>
      </div>
    ),
  },
  {
    selectorId: TOUR_IDS.TEAM,
    position: "right",
    content: (
      <div>
        <p className="font-medium text-sm mb-1">Your team</p>
        <p className="text-xs text-muted-foreground">
          See all your AI team members, their current status, and what they're working on. Add new members anytime.
        </p>
      </div>
    ),
  },
  {
    selectorId: TOUR_IDS.BUDGET,
    position: "right",
    content: (
      <div>
        <p className="font-medium text-sm mb-1">Budget</p>
        <p className="text-xs text-muted-foreground">
          Track spending and set limits for your team. You're always in control of costs.
        </p>
      </div>
    ),
  },
];

/**
 * Registers tour steps so they are ready when the tour is started.
 * The tour is started by the WelcomeTourDialog (after onboarding) or
 * manually via the "Take a tour" button in the sidebar footer.
 */
export function useGuidedTour() {
  const { setSteps } = useTour();

  useEffect(() => {
    setSteps(TOUR_STEPS);
  }, [setSteps]);
}
