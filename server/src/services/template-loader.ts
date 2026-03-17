/**
 * Loads company templates from YAML files at companies/templates/{slug}/template.yaml.
 * Each template declares a set of agents with roles that map to persona files
 * at companies/default/{role}/.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __moduleDir = path.dirname(fileURLToPath(import.meta.url));

export interface CompanyTemplateAgent {
  id: string;
  role: string;
  name: string;
  title: string;
  reportsTo: string | null;
}

export interface CompanyTemplateBootstrapGoal {
  title: string;
  description: string;
}

export interface CompanyTemplate {
  slug: string;
  name: string;
  description: string;
  industry: string;
  icon?: string;
  agents: CompanyTemplateAgent[];
  bootstrapGoal?: CompanyTemplateBootstrapGoal;
}

// Module-level cache
let cachedTemplates: CompanyTemplate[] | null = null;

// Candidate paths for the companies/ directory relative to this module.
// dist/services/ -> ../../companies  (built output)
// src/services/  -> ../../../companies (dev with tsx)
const COMPANIES_CANDIDATES = [
  path.resolve(__moduleDir, "../../companies"),
  path.resolve(__moduleDir, "../../../companies"),
  path.resolve(process.cwd(), "companies"),
];

function resolveCompaniesSubdir(subdir: string): string {
  for (const candidate of COMPANIES_CANDIDATES) {
    const full = path.join(candidate, subdir);
    if (fs.existsSync(full)) return full;
  }
  return path.resolve(process.cwd(), "companies", subdir);
}

function resolveTemplatesDir(): string {
  return resolveCompaniesSubdir("templates");
}

function resolveDefaultDir(): string {
  return resolveCompaniesSubdir("default");
}

function loadTemplatesFromDisk(): CompanyTemplate[] {
  const templatesDir = resolveTemplatesDir();
  if (!fs.existsSync(templatesDir)) {
    console.warn(`[template-loader] Templates directory not found: ${templatesDir}`);
    return [];
  }

  const defaultDir = resolveDefaultDir();
  const templates: CompanyTemplate[] = [];
  const slugDirs = fs.readdirSync(templatesDir, { withFileTypes: true });

  for (const entry of slugDirs) {
    if (!entry.isDirectory()) continue;
    const yamlPath = path.join(templatesDir, entry.name, "template.yaml");
    if (!fs.existsSync(yamlPath)) continue;

    try {
      const raw = fs.readFileSync(yamlPath, "utf-8");
      const data = yaml.load(raw) as Record<string, unknown>;

      const agents = (data.agents as CompanyTemplateAgent[]) ?? [];

      // Validate that each agent's role has persona files
      for (const agent of agents) {
        const roleDir = path.join(defaultDir, agent.role);
        if (!fs.existsSync(roleDir)) {
          console.warn(
            `[template-loader] Template "${entry.name}": role "${agent.role}" has no persona files at ${roleDir}`
          );
        }
      }

      const bootstrapGoal = data.bootstrapGoal as CompanyTemplateBootstrapGoal | undefined;

      templates.push({
        slug: (data.slug as string) ?? entry.name,
        name: (data.name as string) ?? entry.name,
        description: (data.description as string) ?? "",
        industry: (data.industry as string) ?? "",
        icon: data.icon as string | undefined,
        agents,
        bootstrapGoal,
      });
    } catch (err) {
      console.error(`[template-loader] Failed to load template ${entry.name}:`, err);
    }
  }

  return templates;
}

export function loadCompanyTemplates(): CompanyTemplate[] {
  if (!cachedTemplates) {
    cachedTemplates = loadTemplatesFromDisk();
  }
  return cachedTemplates;
}

export function loadCompanyTemplateBySlug(slug: string): CompanyTemplate | undefined {
  return loadCompanyTemplates().find((t) => t.slug === slug);
}

/** Force reload from disk (useful in tests) */
export function reloadCompanyTemplates(): CompanyTemplate[] {
  cachedTemplates = null;
  return loadCompanyTemplates();
}
