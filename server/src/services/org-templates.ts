/**
 * Built-in org chart templates library.
 *
 * Each template defines a set of agent role nodes and their reporting edges,
 * ready to be applied to a company's orgChartData (React Flow format).
 */

export interface OrgTemplateNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    label: string;
    role: string;
    title: string;
    capabilities: string;
  };
}

export interface OrgTemplateEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  label?: string;
}

export interface OrgTemplateDefinition {
  id: string;
  name: string;
  description: string;
  industry: string;
  nodes: OrgTemplateNode[];
  edges: OrgTemplateEdge[];
}

const builtinTemplates: OrgTemplateDefinition[] = [
  {
    id: "software-development-team",
    name: "Software Development Team",
    description:
      "A balanced engineering team with project management, frontend/backend development, quality assurance, and DevOps.",
    industry: "Technology",
    nodes: [
      {
        id: "pm",
        type: "default",
        position: { x: 300, y: 0 },
        data: {
          label: "Project Manager",
          role: "manager",
          title: "Project Manager",
          capabilities: "project planning, sprint management, stakeholder communication, risk assessment",
        },
      },
      {
        id: "backend",
        type: "default",
        position: { x: 100, y: 150 },
        data: {
          label: "Backend Developer",
          role: "engineer",
          title: "Backend Developer",
          capabilities: "API design, database design, server-side logic, performance optimization",
        },
      },
      {
        id: "frontend",
        type: "default",
        position: { x: 300, y: 150 },
        data: {
          label: "Frontend Developer",
          role: "engineer",
          title: "Frontend Developer",
          capabilities: "UI development, responsive design, accessibility, component architecture",
        },
      },
      {
        id: "qa",
        type: "default",
        position: { x: 500, y: 150 },
        data: {
          label: "QA Tester",
          role: "qa",
          title: "QA Tester",
          capabilities: "test planning, automated testing, regression testing, bug reporting",
        },
      },
      {
        id: "devops",
        type: "default",
        position: { x: 100, y: 300 },
        data: {
          label: "DevOps Engineer",
          role: "engineer",
          title: "DevOps Engineer",
          capabilities: "CI/CD pipelines, infrastructure as code, monitoring, deployment automation",
        },
      },
    ],
    edges: [
      { id: "pm-backend", source: "pm", target: "backend", label: "reports to" },
      { id: "pm-frontend", source: "pm", target: "frontend", label: "reports to" },
      { id: "pm-qa", source: "pm", target: "qa", label: "reports to" },
      { id: "pm-devops", source: "pm", target: "devops", label: "reports to" },
    ],
  },
  {
    id: "digital-marketing-agency",
    name: "Digital Marketing Agency",
    description:
      "A full-service digital marketing team covering account management, SEO, content, social media, and analytics.",
    industry: "Marketing",
    nodes: [
      {
        id: "account-mgr",
        type: "default",
        position: { x: 300, y: 0 },
        data: {
          label: "Account Manager",
          role: "manager",
          title: "Account Manager",
          capabilities: "client relations, campaign strategy, budget management, cross-team coordination",
        },
      },
      {
        id: "seo",
        type: "default",
        position: { x: 50, y: 150 },
        data: {
          label: "SEO Specialist",
          role: "specialist",
          title: "SEO Specialist",
          capabilities: "keyword research, on-page optimization, link building, technical SEO audits",
        },
      },
      {
        id: "content",
        type: "default",
        position: { x: 250, y: 150 },
        data: {
          label: "Content Writer",
          role: "creator",
          title: "Content Writer",
          capabilities: "blog writing, copywriting, content strategy, editorial calendar management",
        },
      },
      {
        id: "social",
        type: "default",
        position: { x: 450, y: 150 },
        data: {
          label: "Social Media Manager",
          role: "specialist",
          title: "Social Media Manager",
          capabilities: "social scheduling, community management, paid social ads, engagement tracking",
        },
      },
      {
        id: "analytics",
        type: "default",
        position: { x: 250, y: 300 },
        data: {
          label: "Analytics Lead",
          role: "analyst",
          title: "Analytics Lead",
          capabilities: "data analysis, reporting dashboards, conversion optimization, A/B testing",
        },
      },
    ],
    edges: [
      { id: "am-seo", source: "account-mgr", target: "seo", label: "reports to" },
      { id: "am-content", source: "account-mgr", target: "content", label: "reports to" },
      { id: "am-social", source: "account-mgr", target: "social", label: "reports to" },
      { id: "am-analytics", source: "account-mgr", target: "analytics", label: "reports to" },
    ],
  },
  {
    id: "legal-research-firm",
    name: "Legal Research Firm",
    description:
      "A structured legal team with partners, associates, researchers, paralegals, and document reviewers for comprehensive legal services.",
    industry: "Legal",
    nodes: [
      {
        id: "partner",
        type: "default",
        position: { x: 300, y: 0 },
        data: {
          label: "Managing Partner",
          role: "executive",
          title: "Managing Partner",
          capabilities: "case strategy, client acquisition, team leadership, legal advisory",
        },
      },
      {
        id: "associate",
        type: "default",
        position: { x: 150, y: 150 },
        data: {
          label: "Senior Associate",
          role: "specialist",
          title: "Senior Associate",
          capabilities: "legal research, brief writing, case analysis, client counseling",
        },
      },
      {
        id: "analyst",
        type: "default",
        position: { x: 450, y: 150 },
        data: {
          label: "Research Analyst",
          role: "analyst",
          title: "Research Analyst",
          capabilities: "precedent research, statutory analysis, data compilation, memo drafting",
        },
      },
      {
        id: "paralegal",
        type: "default",
        position: { x: 150, y: 300 },
        data: {
          label: "Paralegal",
          role: "support",
          title: "Paralegal",
          capabilities: "document preparation, filing, case management, client communication",
        },
      },
      {
        id: "doc-reviewer",
        type: "default",
        position: { x: 450, y: 300 },
        data: {
          label: "Document Reviewer",
          role: "support",
          title: "Document Reviewer",
          capabilities: "document review, privilege analysis, redaction, e-discovery",
        },
      },
    ],
    edges: [
      { id: "p-assoc", source: "partner", target: "associate", label: "reports to" },
      { id: "p-analyst", source: "partner", target: "analyst", label: "reports to" },
      { id: "assoc-para", source: "associate", target: "paralegal", label: "reports to" },
      { id: "analyst-doc", source: "analyst", target: "doc-reviewer", label: "reports to" },
    ],
  },
  {
    id: "customer-support-center",
    name: "Customer Support Center",
    description:
      "A tiered support organization with management, front-line agents, escalation specialists, and knowledge base management.",
    industry: "Customer Service",
    nodes: [
      {
        id: "support-mgr",
        type: "default",
        position: { x: 300, y: 0 },
        data: {
          label: "Support Manager",
          role: "manager",
          title: "Support Manager",
          capabilities: "team management, SLA monitoring, process improvement, escalation oversight",
        },
      },
      {
        id: "tier1",
        type: "default",
        position: { x: 50, y: 150 },
        data: {
          label: "Tier 1 Agent",
          role: "support",
          title: "Tier 1 Support Agent",
          capabilities: "ticket triage, FAQ resolution, initial troubleshooting, customer communication",
        },
      },
      {
        id: "tier2",
        type: "default",
        position: { x: 250, y: 150 },
        data: {
          label: "Tier 2 Agent",
          role: "support",
          title: "Tier 2 Support Agent",
          capabilities: "advanced troubleshooting, technical investigation, root cause analysis, bug reporting",
        },
      },
      {
        id: "kb-editor",
        type: "default",
        position: { x: 450, y: 150 },
        data: {
          label: "Knowledge Base Editor",
          role: "creator",
          title: "Knowledge Base Editor",
          capabilities: "documentation writing, FAQ curation, tutorial creation, knowledge management",
        },
      },
      {
        id: "escalation",
        type: "default",
        position: { x: 250, y: 300 },
        data: {
          label: "Escalation Handler",
          role: "specialist",
          title: "Escalation Handler",
          capabilities: "critical issue resolution, VIP support, cross-team coordination, incident management",
        },
      },
    ],
    edges: [
      { id: "sm-t1", source: "support-mgr", target: "tier1", label: "reports to" },
      { id: "sm-t2", source: "support-mgr", target: "tier2", label: "reports to" },
      { id: "sm-kb", source: "support-mgr", target: "kb-editor", label: "reports to" },
      { id: "t2-esc", source: "tier2", target: "escalation", label: "escalates to" },
    ],
  },
  {
    id: "data-analytics-team",
    name: "Data Analytics Team",
    description:
      "A data-focused team with leadership, engineering, data science, machine learning, and business intelligence capabilities.",
    industry: "Data & AI",
    nodes: [
      {
        id: "director",
        type: "default",
        position: { x: 300, y: 0 },
        data: {
          label: "Analytics Director",
          role: "executive",
          title: "Analytics Director",
          capabilities: "data strategy, stakeholder management, team leadership, roadmap planning",
        },
      },
      {
        id: "data-eng",
        type: "default",
        position: { x: 50, y: 150 },
        data: {
          label: "Data Engineer",
          role: "engineer",
          title: "Data Engineer",
          capabilities: "ETL pipelines, data warehousing, data modeling, pipeline orchestration",
        },
      },
      {
        id: "data-sci",
        type: "default",
        position: { x: 250, y: 150 },
        data: {
          label: "Data Scientist",
          role: "specialist",
          title: "Data Scientist",
          capabilities: "statistical analysis, hypothesis testing, experimental design, predictive modeling",
        },
      },
      {
        id: "ml-eng",
        type: "default",
        position: { x: 450, y: 150 },
        data: {
          label: "ML Engineer",
          role: "engineer",
          title: "ML Engineer",
          capabilities: "model training, model deployment, feature engineering, MLOps",
        },
      },
      {
        id: "bi-analyst",
        type: "default",
        position: { x: 250, y: 300 },
        data: {
          label: "BI Analyst",
          role: "analyst",
          title: "BI Analyst",
          capabilities: "dashboard creation, KPI tracking, ad-hoc analysis, data visualization",
        },
      },
    ],
    edges: [
      { id: "dir-de", source: "director", target: "data-eng", label: "reports to" },
      { id: "dir-ds", source: "director", target: "data-sci", label: "reports to" },
      { id: "dir-ml", source: "director", target: "ml-eng", label: "reports to" },
      { id: "ds-bi", source: "data-sci", target: "bi-analyst", label: "reports to" },
    ],
  },
];

export function getBuiltinTemplates(): OrgTemplateDefinition[] {
  return builtinTemplates;
}

export function getBuiltinTemplateById(id: string): OrgTemplateDefinition | undefined {
  return builtinTemplates.find((t) => t.id === id);
}
