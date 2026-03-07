CREATE TABLE IF NOT EXISTS "indexed_artifacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "agent_id" uuid REFERENCES "agents"("id"),
  "project_id" uuid REFERENCES "projects"("id"),
  "issue_id" uuid REFERENCES "issues"("id"),
  "run_id" uuid REFERENCES "heartbeat_runs"("id"),
  "object_key" text NOT NULL,
  "artifact_type" text NOT NULL,
  "chunk_count" integer NOT NULL DEFAULT 1,
  "qdrant_point_ids" text[],
  "embedding_model" text NOT NULL,
  "token_count" integer DEFAULT 0,
  "status" text NOT NULL DEFAULT 'indexed',
  "indexed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "indexed_artifacts_company_object_key_idx" ON "indexed_artifacts" ("company_id", "object_key");
CREATE INDEX IF NOT EXISTS "indexed_artifacts_company_project_idx" ON "indexed_artifacts" ("company_id", "project_id");
CREATE INDEX IF NOT EXISTS "indexed_artifacts_company_run_idx" ON "indexed_artifacts" ("company_id", "run_id");

-- RLS policy for indexed_artifacts
ALTER TABLE "indexed_artifacts" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "indexed_artifacts_company_isolation" ON "indexed_artifacts"
  USING (public.rls_check_id('app.current_company_ids', company_id))
  WITH CHECK (public.rls_check_id('app.current_company_ids', company_id));
