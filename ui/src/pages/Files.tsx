import { useEffect } from "react";
import {
  FolderOpen,
  Bot,
  FolderSync,
  FileText,
} from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { EmptyState } from "../components/EmptyState";
import { FileBrowser } from "../components/FileBrowser";
import { FeatureInfoSection } from "../components/FeatureInfoSection";

const filesFeatures = [
  {
    icon: Bot,
    title: "Agent workspace",
    description:
      "Every agent in your company shares this workspace. When agents research, write reports, or generate artifacts, the files appear here automatically.",
  },
  {
    icon: FolderSync,
    title: "Shared across your team",
    description:
      "All agents can read and write to the same workspace. This lets your CEO agent set strategy docs that your engineer agents can reference.",
  },
  {
    icon: FileText,
    title: "Upload your own files",
    description:
      "Drag and drop files or use the upload button to share documents, datasets, or reference materials with your agents.",
  },
];

export function Files() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Files" }]);
  }, [setBreadcrumbs]);

  if (!selectedCompanyId) {
    return <EmptyState icon={FolderOpen} message="Select a company to browse files." />;
  }

  return (
    <div>
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold">Files</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse and manage files shared across your workspace.
          </p>
        </div>
        <FileBrowser companyId={selectedCompanyId} />
      </div>
      <FeatureInfoSection
        title="How the workspace works"
        subtitle="The file workspace is the shared filesystem for all agents in your company."
        features={filesFeatures}
      />
    </div>
  );
}
