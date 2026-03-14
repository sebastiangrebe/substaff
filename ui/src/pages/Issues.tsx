import { useEffect, useMemo } from "react";
import { useSearchParams } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys, sharedQueries } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { IssuesList } from "../components/IssuesList";
import { FeatureInfoSection } from "../components/FeatureInfoSection";
import { CircleDot, Bot, Zap, GitPullRequest } from "lucide-react";

export function Issues() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: liveRuns } = useQuery(sharedQueries.liveRuns(selectedCompanyId!));

  const liveIssueIds = useMemo(() => {
    const ids = new Set<string>();
    for (const run of liveRuns ?? []) {
      if (run.issueId) ids.add(run.issueId);
    }
    return ids;
  }, [liveRuns]);

  useEffect(() => {
    setBreadcrumbs([{ label: "Tasks" }]);
  }, [setBreadcrumbs]);

  const { data: issues, isLoading, error } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const updateIssue = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      issuesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId!) });
    },
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={CircleDot} message="Select a company to view issues." />;
  }

  return (
    <div>
      <IssuesList
        issues={issues ?? []}
        isLoading={isLoading}
        error={error as Error | null}
        agents={agents}
        liveIssueIds={liveIssueIds}
        viewStateKey="substaff:issues-view"
        initialAssignees={searchParams.get("assignee") ? [searchParams.get("assignee")!] : undefined}
        onUpdateIssue={(id, data) => updateIssue.mutate({ id, data })}
      />
      {!isLoading && (issues ?? []).length < 5 && (
        <FeatureInfoSection
          title="How tasks work"
          subtitle="Tasks are the atomic units of work that your AI agents pick up, execute, and complete autonomously."
          features={[
            {
              icon: Bot,
              title: "Agents pick up tasks",
              description:
                "Create a task and assign it to an agent. They'll automatically check out the task, work on it, and report back when done.",
            },
            {
              icon: Zap,
              title: "Automatic execution",
              description:
                "The heartbeat engine schedules agent wakeups. When an agent has assigned tasks, it executes them in priority order without manual intervention.",
            },
            {
              icon: GitPullRequest,
              title: "Approval gates",
              description:
                "For sensitive actions, agents request approval before proceeding. You stay in control while your agents handle the heavy lifting.",
            },
          ]}
        />
      )}
    </div>
  );
}
