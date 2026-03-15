-- Add missing RLS policies for tables created after the initial RLS migration (0025)

-- issue_dependencies (added in 0028, has company_id but no RLS)
ALTER TABLE "issue_dependencies" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "issue_dependencies_tenant_isolation" ON "issue_dependencies"
  USING (public.rls_check_id('app.current_company_ids', company_id));

-- company_roles (added in 0034, has company_id but no RLS)
ALTER TABLE "company_roles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_roles_tenant_isolation" ON "company_roles"
  USING (public.rls_check_id('app.current_company_ids', company_id));

-- credit_transactions (has vendor_id but no RLS)
ALTER TABLE "credit_transactions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credit_transactions_tenant_isolation" ON "credit_transactions"
  USING (public.rls_check_id('app.current_vendor_ids', vendor_id));
