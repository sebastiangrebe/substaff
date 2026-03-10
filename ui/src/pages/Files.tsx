import { useEffect } from "react";
import { FolderOpen } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { EmptyState } from "../components/EmptyState";
import { FileBrowser } from "../components/FileBrowser";

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
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Files</h1>
        <p className="mt-1 text-sm text-muted-foreground">Browse and manage files shared across your workspace.</p>
      </div>
      <FileBrowser companyId={selectedCompanyId} />
    </div>
  );
}
