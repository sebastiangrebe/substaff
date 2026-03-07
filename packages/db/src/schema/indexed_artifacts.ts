import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { projects } from "./projects.js";
import { issues } from "./issues.js";
import { heartbeatRuns } from "./heartbeat_runs.js";

export const indexedArtifacts = pgTable(
  "indexed_artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    agentId: uuid("agent_id").references(() => agents.id),
    projectId: uuid("project_id").references(() => projects.id),
    issueId: uuid("issue_id").references(() => issues.id),
    runId: uuid("run_id").references(() => heartbeatRuns.id),
    objectKey: text("object_key").notNull(),
    artifactType: text("artifact_type").notNull(),
    chunkCount: integer("chunk_count").notNull().default(1),
    qdrantPointIds: text("qdrant_point_ids").array(),
    embeddingModel: text("embedding_model").notNull(),
    tokenCount: integer("token_count").default(0),
    status: text("status").notNull().default("indexed"),
    indexedAt: timestamp("indexed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyObjectKeyIdx: index("indexed_artifacts_company_object_key_idx").on(
      table.companyId,
      table.objectKey,
    ),
    companyProjectIdx: index("indexed_artifacts_company_project_idx").on(
      table.companyId,
      table.projectId,
    ),
    companyRunIdx: index("indexed_artifacts_company_run_idx").on(
      table.companyId,
      table.runId,
    ),
  }),
);
