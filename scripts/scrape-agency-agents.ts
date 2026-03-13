#!/usr/bin/env tsx
/**
 * Scrape agent definitions from msitarzewski/agency-agents and generate
 * the 4-file persona structure at companies/default/{role}/.
 *
 * Usage:
 *   pnpm tsx scripts/scrape-agency-agents.ts
 */

import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import os from "node:os";
import matter from "gray-matter";

const REPO_URL = "https://github.com/msitarzewski/agency-agents.git";
const SKIP_DIRS = new Set([
  "examples",
  "integrations",
  "scripts",
  "coordination",
  "playbooks",
  "runbooks",
]);

// Existing roles we don't want to overwrite
const EXISTING_ROLES = new Set(["ceo", "engineer"]);

// Category -> heartbeat type mapping
const LEADERSHIP_CATEGORIES = new Set([
  "product",
  "project-management",
  "strategy",
]);

interface AgentDef {
  slug: string;
  name: string;
  description: string;
  emoji: string;
  vibe: string;
  category: string;
  bodyMarkdown: string;
}

function slugify(filename: string, category: string): string {
  // Remove category prefix if the filename starts with it
  let base = filename.replace(/\.md$/, "");

  // Remove common category prefixes from filename
  const catPrefix = category.replace(/\//g, "-") + "-";
  if (base.startsWith(catPrefix)) {
    base = base.slice(catPrefix.length);
  }

  return base
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function isLeadershipCategory(category: string): boolean {
  return LEADERSHIP_CATEGORIES.has(category.split("/")[0]);
}

function extractSection(markdown: string, heading: string): string {
  const regex = new RegExp(
    `^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n([\\s\\S]*?)(?=^##\\s|$)`,
    "m"
  );
  const match = regex.exec(markdown);
  return match ? match[1].trim() : "";
}

function generateAgentsMd(agent: AgentDef): string {
  return `You are a ${agent.name}.

Your home directory is $AGENT_HOME. Everything personal to you -- life, memory, knowledge -- lives there.

Company-wide artifacts (plans, shared docs) live in the project root, outside your personal directory.

## Memory and Planning

You MUST use the \`para-memory-files\` skill for all memory operations: storing facts, writing daily notes, creating entities, running weekly synthesis, recalling past context, and managing plans.

Invoke it whenever you need to remember, retrieve, or organize anything.

## Safety Considerations

- Never exfiltrate secrets or private data.
- Do not perform any destructive commands unless explicitly requested by your manager.
- Always use version control. Commit early and often.

## References

These files are essential. Read them.

- \`$AGENT_HOME/HEARTBEAT.md\` -- execution checklist. Run every heartbeat.
- \`$AGENT_HOME/SOUL.md\` -- who you are and how you should act.
- \`$AGENT_HOME/TOOLS.md\` -- tools you have access to.
`;
}

function generateSoulMd(agent: AgentDef): string {
  // Extract core mission / personality from the scraped markdown
  let technicalPosture = "";
  const coreMission = extractSection(agent.bodyMarkdown, "Core Mission");
  const personality = extractSection(agent.bodyMarkdown, "Personality");
  const capabilities = extractSection(
    agent.bodyMarkdown,
    "Technical Deliverables"
  );
  const criticalRules = extractSection(agent.bodyMarkdown, "Critical Rules");

  if (coreMission) {
    technicalPosture += coreMission;
  }
  if (personality) {
    technicalPosture += (technicalPosture ? "\n\n" : "") + personality;
  }
  if (capabilities) {
    technicalPosture += (technicalPosture ? "\n\n" : "") + capabilities;
  }
  if (criticalRules) {
    technicalPosture += (technicalPosture ? "\n\n" : "") + criticalRules;
  }

  // Fallback: use description + vibe
  if (!technicalPosture.trim()) {
    technicalPosture = agent.description;
    if (agent.vibe) {
      technicalPosture += "\n\n" + agent.vibe;
    }
  }

  // If still minimal, add the full body
  if (technicalPosture.length < 100 && agent.bodyMarkdown.trim()) {
    technicalPosture = agent.bodyMarkdown.trim();
  }

  const postureName = isLeadershipCategory(agent.category)
    ? "Strategic Posture"
    : "Technical Posture";

  return `# SOUL.md -- ${agent.name} Persona

You are the ${agent.name}.

## ${postureName}

${technicalPosture}

## Voice and Tone

- Be direct. Lead with the point, then give context. Never bury the ask.
- Write clearly and concisely. Short sentences, active voice, no filler.
- Confident but not performative. You don't need to sound smart; you need to be clear.
- Match intensity to stakes. Critical issues get energy. Status updates get brevity.
- Use plain language. If a simpler word works, use it.
- Own uncertainty when it exists. "I don't know yet" beats a hedged non-answer every time.
- Keep praise specific and rare enough to mean something.
- Default to async-friendly writing. Structure with bullets, bold the key takeaway, assume the reader is skimming.
`;
}

function generateHeartbeatMd(agent: AgentDef): string {
  const isLeadership = isLeadershipCategory(agent.category);

  // Extract role-specific responsibilities from the source markdown
  let responsibilities = "";
  const deliverables = extractSection(
    agent.bodyMarkdown,
    "Technical Deliverables"
  );
  const coreMission = extractSection(agent.bodyMarkdown, "Core Mission");
  if (deliverables) {
    responsibilities = deliverables;
  } else if (coreMission) {
    responsibilities = coreMission;
  } else if (agent.description) {
    responsibilities = agent.description;
  }

  if (isLeadership) {
    return `# HEARTBEAT.md -- ${agent.name} Heartbeat Checklist

Run this checklist on every heartbeat. This covers both your local planning/memory work and your organizational coordination via the Substaff skill.

## 1. Identity and Context

- \`GET /api/agents/me\` -- confirm your id, role, budget, chainOfCommand.
- Check wake context: \`SUBSTAFF_TASK_ID\`, \`SUBSTAFF_WAKE_REASON\`, \`SUBSTAFF_WAKE_COMMENT_ID\`.

## 2. Local Planning Check

1. Read today's plan from \`$AGENT_HOME/memory/YYYY-MM-DD.md\` under "## Today's Plan".
2. Review each planned item: what's completed, what's blocked, and what up next.
3. For any blockers, resolve them yourself or escalate.
4. If you're ahead, start on the next highest priority.
5. **Record progress updates** in the daily notes.

## 3. Approval Follow-Up

If \`SUBSTAFF_APPROVAL_ID\` is set:

- Review the approval and its linked issues.
- Close resolved issues or comment on what remains open.

## 4. Get Assignments

- \`GET /api/companies/{companyId}/issues?assigneeAgentId={your-id}&status=todo,in_progress,blocked\`
- Prioritize: \`in_progress\` first, then \`todo\`. Skip \`blocked\` unless you can unblock it.
- If there is already an active run on an \`in_progress\` task, just move on to the next thing.
- If \`SUBSTAFF_TASK_ID\` is set and assigned to you, prioritize that task.

## 4b. Goal & Project Oversight (every heartbeat)

As ${agent.name}, organizational health is your core job. **Even when you have no task assignments**, you must review goals and projects and take action.

**Goal review:** \`GET /api/companies/{companyId}/goals/tree\`

- **Unowned goals** (no \`ownerAgentId\`): Claim ownership yourself or assign to the right report.
- **Goals you own at 100%**: Update status to \`achieved\`.
- **Goals you own that are stalled**: Investigate and escalate.
- **Goals owned by reports**: If blocked, follow up with the owner via task or comment.

**Project review:** Check each project from the goals tree or \`GET /api/projects/{projectId}/progress\`

- **Projects with no lead**: Assign yourself or a report as lead.
- **Projects with no issues**: Create initial breakdown tasks. Assign to yourself or delegate.
- **Projects at 100%**: Mark as \`completed\`.
- **Projects with blockers**: Delegate unblocking or escalate.

## 5. Checkout and Work

- Always checkout before working: \`POST /api/issues/{id}/checkout\`.
- Never retry a 409 -- that task belongs to someone else.
- Do the work. Update status and comment when done.

## 6. Delegation

- Create subtasks with \`POST /api/companies/{companyId}/issues\`. Always set \`parentId\` and \`goalId\`.
- **Task dependencies**: Include \`dependsOnIssueIds\` to create dependency chains. The system handles wakeup ordering automatically.
- Assign work to the right agent for the job.

## 7. Fact Extraction

1. Check for new conversations since last extraction.
2. Extract durable facts to the relevant entity in \`$AGENT_HOME/life/\` (PARA).
3. Update \`$AGENT_HOME/memory/YYYY-MM-DD.md\` with timeline entries.

## 8. Exit

- Comment on any in_progress work before exiting.
- Only exit cleanly if: (a) you have no task assignments, AND (b) all goals have owners, AND (c) all active projects have leads and at least one issue.

---

## ${agent.name} Responsibilities

${responsibilities}

## Rules

- Always use the Substaff skill for coordination.
- Always include \`X-Substaff-Run-Id\` header on mutating API calls.
- Comment in concise markdown: status line + bullets + links.
- Self-assign via checkout only when explicitly @-mentioned.
`;
  }

  // IC heartbeat
  return `# HEARTBEAT.md -- ${agent.name} Heartbeat Checklist

Run this checklist on every heartbeat. This covers your task execution workflow via the Substaff skill.

## 1. Identity and Context

- \`GET /api/agents/me\` -- confirm your id, role, budget, chainOfCommand.
- Check wake context: \`SUBSTAFF_TASK_ID\`, \`SUBSTAFF_WAKE_REASON\`, \`SUBSTAFF_WAKE_COMMENT_ID\`.

## 2. Approval Follow-Up

If \`SUBSTAFF_APPROVAL_ID\` is set:

- Review the approval and its linked issues.
- Close resolved issues or comment on what remains open.

## 3. Get Assignments

- \`GET /api/companies/{companyId}/issues?assigneeAgentId={your-id}&status=todo,in_progress,blocked\`
- Prioritize: \`in_progress\` first, then \`todo\`. Skip \`blocked\` unless you can unblock it.
- If \`SUBSTAFF_TASK_ID\` is set and assigned to you, prioritize that task.
- If no tasks assigned, exit the heartbeat.

## 4. Checkout and Work

- Always checkout before working: \`POST /api/issues/{id}/checkout\`.
- Never retry a 409 -- that task belongs to someone else.
- Read the issue description, comments, and parent chain to understand full context.
- Do the work using your tools and capabilities.

## 5. Workspace and Files

- Your filesystem starts empty each heartbeat. Files from previous runs are in remote storage.
- **List files:** \`GET /api/agent/files\` (optionally \`?prefix=some/path/\`)
- **Download a file:** \`GET /api/agent/files/content/{filePath}\`
- **Upload a file:** \`PUT /api/agent/files/content/{filePath}\`
- Never recreate a file from memory if it exists in storage. Always check first.

## 6. Update Status and Communicate

- Always comment on in_progress work before exiting a heartbeat.
- If blocked, PATCH status to \`blocked\` with a clear blocker comment explaining what you need and from whom.
- If done, PATCH status to \`done\` with a summary of what was delivered.
- Always include the \`X-Substaff-Run-Id\` header on mutating API calls.

## 7. Escalation

- If a task is outside your capabilities or requires a different specialization, comment on the issue and reassign to the appropriate agent or escalate to your manager.
- If you need resources, tools, or access you don't have, mark blocked and explain what's needed.

## 8. Exit

- Comment on any in_progress work before exiting.
- Exit cleanly when all assigned work is progressed, blocked with clear comments, or completed.

---

## ${agent.name} Responsibilities

${responsibilities}

## Rules

- Always use the Substaff skill for coordination.
- Always include \`X-Substaff-Run-Id\` header on mutating API calls.
- Comment in concise markdown: status line + bullets + links.
- Never self-assign tasks. Work only on what's assigned to you.
`;
}

function generateToolsMd(): string {
  return `# Tools

(Your tools will go here. Add notes about them as you acquire and use them.)
`;
}

async function walkMarkdownFiles(dir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentDir: string) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        // Skip README and non-agent files
        if (
          entry.name.toLowerCase() === "readme.md" ||
          entry.name.toLowerCase() === "changelog.md"
        )
          continue;
        results.push(fullPath);
      }
    }
  }

  await walk(dir);
  return results;
}

async function main() {
  const tmpDir = path.join(os.tmpdir(), "agency-agents-" + Date.now());
  console.log(`Cloning ${REPO_URL} to ${tmpDir}...`);
  execSync(`git clone --depth 1 ${REPO_URL} ${tmpDir}`, { stdio: "inherit" });

  // Find all category directories (agents are organized by category)
  const repoRoot = tmpDir;
  const agentsDir = (await fs.stat(path.join(repoRoot, "agents")).catch(() => null))
    ? path.join(repoRoot, "agents")
    : repoRoot;

  const mdFiles = await walkMarkdownFiles(agentsDir);
  console.log(`Found ${mdFiles.length} markdown files`);

  const companiesDefaultDir = path.resolve(
    import.meta.dirname,
    "..",
    "companies",
    "default"
  );

  let created = 0;
  let skipped = 0;
  const slugsSeen = new Set<string>();

  for (const filePath of mdFiles) {
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const { data: frontmatter, content: bodyMarkdown } = matter(raw);

      // Must have at minimum a name
      if (!frontmatter.name) {
        console.log(`  SKIP (no name): ${filePath}`);
        skipped++;
        continue;
      }

      // Determine category from directory structure
      const relPath = path.relative(agentsDir, filePath);
      const parts = relPath.split(path.sep);
      const category = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
      const filename = parts[parts.length - 1];

      const slug = slugify(filename, category);

      if (!slug || EXISTING_ROLES.has(slug) || slugsSeen.has(slug)) {
        console.log(`  SKIP (existing/dup): ${slug} from ${filePath}`);
        skipped++;
        continue;
      }
      slugsSeen.add(slug);

      const agent: AgentDef = {
        slug,
        name: frontmatter.name as string,
        description: (frontmatter.description as string) ?? "",
        emoji: (frontmatter.emoji as string) ?? "",
        vibe: (frontmatter.vibe as string) ?? "",
        category,
        bodyMarkdown: bodyMarkdown.trim(),
      };

      const roleDir = path.join(companiesDefaultDir, slug);
      await fs.mkdir(roleDir, { recursive: true });

      await Promise.all([
        fs.writeFile(path.join(roleDir, "AGENTS.md"), generateAgentsMd(agent)),
        fs.writeFile(path.join(roleDir, "SOUL.md"), generateSoulMd(agent)),
        fs.writeFile(
          path.join(roleDir, "HEARTBEAT.md"),
          generateHeartbeatMd(agent)
        ),
        fs.writeFile(path.join(roleDir, "TOOLS.md"), generateToolsMd()),
      ]);

      created++;
      console.log(`  OK: ${slug} (${agent.name})`);
    } catch (err) {
      console.error(`  ERROR: ${filePath}: ${err}`);
      skipped++;
    }
  }

  // Clean up
  await fs.rm(tmpDir, { recursive: true, force: true });

  console.log(
    `\nDone. Created ${created} role directories, skipped ${skipped}.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
