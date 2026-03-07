-- Enable Row-Level Security for multi-tenant vendor isolation.
-- Session variables used by policies:
--   app.current_vendor_ids  — comma-separated list of vendor UUIDs the actor can access
--   app.current_company_ids — comma-separated list of company UUIDs the actor can access
--
-- No bypass mechanism exists. All access must go through proper vendor/company scoping.
-- Background services must set the appropriate vendor/company IDs before querying.

-- Helper function: check if a UUID is in a comma-separated session variable
CREATE OR REPLACE FUNCTION public.rls_check_id(setting_name text, check_id uuid) RETURNS boolean AS $$
BEGIN
  RETURN check_id = ANY(string_to_array(current_setting(setting_name, true), ',')::uuid[]);
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$ LANGUAGE plpgsql STABLE;
--> statement-breakpoint

-- ============================================================
-- VENDOR-LEVEL TABLES (scoped by vendor_id directly)
-- ============================================================

-- vendors
ALTER TABLE "vendors" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "vendors_tenant_isolation" ON "vendors"
  USING (public.rls_check_id('app.current_vendor_ids', id));
--> statement-breakpoint

-- vendor_memberships
ALTER TABLE "vendor_memberships" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "vendor_memberships_tenant_isolation" ON "vendor_memberships"
  USING (public.rls_check_id('app.current_vendor_ids', vendor_id));
--> statement-breakpoint

-- vendor_usage
ALTER TABLE "vendor_usage" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "vendor_usage_tenant_isolation" ON "vendor_usage"
  USING (public.rls_check_id('app.current_vendor_ids', vendor_id));
--> statement-breakpoint

-- org_templates (vendor_id is nullable — null means shared/global template)
ALTER TABLE "org_templates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "org_templates_tenant_isolation" ON "org_templates"
  USING (vendor_id IS NULL OR public.rls_check_id('app.current_vendor_ids', vendor_id));
--> statement-breakpoint

-- ============================================================
-- COMPANY-LEVEL TABLES (scoped by company_id)
-- ============================================================

-- companies (has vendor_id — accessible by vendor OR direct company membership)
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "companies_tenant_isolation" ON "companies"
  USING (public.rls_check_id('app.current_vendor_ids', vendor_id) OR public.rls_check_id('app.current_company_ids', id));
--> statement-breakpoint

-- agents
ALTER TABLE "agents" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "agents_tenant_isolation" ON "agents"
  USING (public.rls_check_id('app.current_company_ids', company_id));
--> statement-breakpoint

-- company_memberships
ALTER TABLE "company_memberships" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "company_memberships_tenant_isolation" ON "company_memberships"
  USING (public.rls_check_id('app.current_company_ids', company_id));
--> statement-breakpoint

-- principal_permission_grants
ALTER TABLE "principal_permission_grants" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "principal_permission_grants_tenant_isolation" ON "principal_permission_grants"
  USING (public.rls_check_id('app.current_company_ids', company_id));
--> statement-breakpoint

-- invites (company_id is nullable)
ALTER TABLE "invites" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "invites_tenant_isolation" ON "invites"
  USING (company_id IS NULL OR public.rls_check_id('app.current_company_ids', company_id));
--> statement-breakpoint

-- join_requests
ALTER TABLE "join_requests" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "join_requests_tenant_isolation" ON "join_requests"
  USING (public.rls_check_id('app.current_company_ids', company_id));
--> statement-breakpoint

-- projects
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "projects_tenant_isolation" ON "projects"
  USING (public.rls_check_id('app.current_company_ids', company_id));
--> statement-breakpoint

-- project_workspaces
ALTER TABLE "project_workspaces" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "project_workspaces_tenant_isolation" ON "project_workspaces"
  USING (public.rls_check_id('app.current_company_ids', company_id));
--> statement-breakpoint

-- project_goals
ALTER TABLE "project_goals" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "project_goals_tenant_isolation" ON "project_goals"
  USING (public.rls_check_id('app.current_company_ids', company_id));
--> statement-breakpoint

-- project_state
ALTER TABLE "project_state" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "project_state_tenant_isolation" ON "project_state"
  USING (public.rls_check_id('app.current_company_ids', company_id));
--> statement-breakpoint

-- goals
ALTER TABLE "goals" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "goals_tenant_isolation" ON "goals"
  USING (public.rls_check_id('app.current_company_ids', company_id));
--> statement-breakpoint

-- issues
ALTER TABLE "issues" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "issues_tenant_isolation" ON "issues"
  USING (public.rls_check_id('app.current_company_ids', company_id));
--> statement-breakpoint

-- issue_approvals
ALTER TABLE "issue_approvals" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "issue_approvals_tenant_isolation" ON "issue_approvals"
  USING (public.rls_check_id('app.current_company_ids', company_id));
--> statement-breakpoint

-- issue_comments
ALTER TABLE "issue_comments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "issue_comments_tenant_isolation" ON "issue_comments"
  USING (public.rls_check_id('app.current_company_ids', company_id));
--> statement-breakpoint

-- issue_attachments
ALTER TABLE "issue_attachments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "issue_attachments_tenant_isolation" ON "issue_attachments"
  USING (public.rls_check_id('app.current_company_ids', company_id));
--> statement-breakpoint

-- issue_labels
ALTER TABLE "issue_labels" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "issue_labels_tenant_isolation" ON "issue_labels"
  USING (public.rls_check_id('app.current_company_ids', company_id));
--> statement-breakpoint

-- labels
ALTER TABLE "labels" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "labels_tenant_isolation" ON "labels"
  USING (public.rls_check_id('app.current_company_ids', company_id));
--> statement-breakpoint

-- assets
ALTER TABLE "assets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "assets_tenant_isolation" ON "assets"
  USING (public.rls_check_id('app.current_company_ids', company_id));
--> statement-breakpoint

-- approvals
ALTER TABLE "approvals" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "approvals_tenant_isolation" ON "approvals"
  USING (public.rls_check_id('app.current_company_ids', company_id));
--> statement-breakpoint

-- approval_comments
ALTER TABLE "approval_comments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "approval_comments_tenant_isolation" ON "approval_comments"
  USING (public.rls_check_id('app.current_company_ids', company_id));
--> statement-breakpoint

-- activity_log
ALTER TABLE "activity_log" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "activity_log_tenant_isolation" ON "activity_log"
  USING (public.rls_check_id('app.current_company_ids', company_id));
--> statement-breakpoint

-- company_secrets
ALTER TABLE "company_secrets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "company_secrets_tenant_isolation" ON "company_secrets"
  USING (public.rls_check_id('app.current_company_ids', company_id));
--> statement-breakpoint

-- company_secret_versions (indirect via company_secrets FK — use subquery)
ALTER TABLE "company_secret_versions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "company_secret_versions_tenant_isolation" ON "company_secret_versions"
  USING (EXISTS (
    SELECT 1 FROM company_secrets cs
    WHERE cs.id = company_secret_versions.secret_id
      AND public.rls_check_id('app.current_company_ids', cs.company_id)
  ));
--> statement-breakpoint

-- agent_api_keys
ALTER TABLE "agent_api_keys" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "agent_api_keys_tenant_isolation" ON "agent_api_keys"
  USING (public.rls_check_id('app.current_company_ids', company_id));
--> statement-breakpoint

-- agent_config_revisions
ALTER TABLE "agent_config_revisions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "agent_config_revisions_tenant_isolation" ON "agent_config_revisions"
  USING (public.rls_check_id('app.current_company_ids', company_id));
--> statement-breakpoint

-- agent_runtime_state
ALTER TABLE "agent_runtime_state" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "agent_runtime_state_tenant_isolation" ON "agent_runtime_state"
  USING (public.rls_check_id('app.current_company_ids', company_id));
--> statement-breakpoint

-- agent_task_sessions
ALTER TABLE "agent_task_sessions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "agent_task_sessions_tenant_isolation" ON "agent_task_sessions"
  USING (public.rls_check_id('app.current_company_ids', company_id));
--> statement-breakpoint

-- agent_wakeup_requests
ALTER TABLE "agent_wakeup_requests" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "agent_wakeup_requests_tenant_isolation" ON "agent_wakeup_requests"
  USING (public.rls_check_id('app.current_company_ids', company_id));
--> statement-breakpoint

-- heartbeat_runs
ALTER TABLE "heartbeat_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "heartbeat_runs_tenant_isolation" ON "heartbeat_runs"
  USING (public.rls_check_id('app.current_company_ids', company_id));
--> statement-breakpoint

-- heartbeat_run_events
ALTER TABLE "heartbeat_run_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "heartbeat_run_events_tenant_isolation" ON "heartbeat_run_events"
  USING (public.rls_check_id('app.current_company_ids', company_id));
--> statement-breakpoint

-- cost_events (has both vendor_id and company_id — allow access by either)
ALTER TABLE "cost_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "cost_events_tenant_isolation" ON "cost_events"
  USING (public.rls_check_id('app.current_company_ids', company_id) OR public.rls_check_id('app.current_vendor_ids', vendor_id));
--> statement-breakpoint

-- integration_connections (has both vendor_id and company_id — allow access by either)
ALTER TABLE "integration_connections" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "integration_connections_tenant_isolation" ON "integration_connections"
  USING (public.rls_check_id('app.current_company_ids', company_id) OR public.rls_check_id('app.current_vendor_ids', vendor_id));
--> statement-breakpoint

-- task_plans
ALTER TABLE "task_plans" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "task_plans_tenant_isolation" ON "task_plans"
  USING (public.rls_check_id('app.current_company_ids', company_id));
