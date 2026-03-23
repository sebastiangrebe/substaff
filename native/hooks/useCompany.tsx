import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Company } from "@substaff/shared";
import { queryKeys } from "@substaff/app-core/queries";
import { ApiError } from "@substaff/app-core/api/client";
import { useApi } from "./useApi";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "substaff.selectedCompanyId";

interface CompanyContextValue {
  companies: Company[];
  selectedCompanyId: string | null;
  selectedCompany: Company | null;
  loading: boolean;
  setSelectedCompanyId: (companyId: string) => void;
  reloadCompanies: () => Promise<void>;
  createCompany: (data: {
    name: string;
    description?: string | null;
    budgetMonthlyCents?: number;
  }) => Promise<Company>;
}

const CompanyContext = createContext<CompanyContextValue | null>(null);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { companiesApi } = useApi();
  const [selectedCompanyId, setSelectedCompanyIdState] = useState<string | null>(null);
  const [storageLoaded, setStorageLoaded] = useState(false);

  // Load stored company ID
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored) setSelectedCompanyIdState(stored);
      setStorageLoaded(true);
    });
  }, []);

  const {
    data: companies = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.companies.all,
    queryFn: async () => {
      try {
        return await companiesApi.list();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return [];
        throw err;
      }
    },
    enabled: storageLoaded,
    retry: false,
  });

  const activeCompanies = useMemo(
    () => companies.filter((c) => c.status !== "archived"),
    [companies],
  );

  // Auto-select first company
  useEffect(() => {
    if (companies.length === 0) return;
    const selectableCompanies = activeCompanies.length > 0 ? activeCompanies : companies;
    if (selectedCompanyId && selectableCompanies.some((c) => c.id === selectedCompanyId)) return;
    const next = selectableCompanies[0]!.id;
    setSelectedCompanyIdState(next);
    AsyncStorage.setItem(STORAGE_KEY, next);
  }, [companies, selectedCompanyId, activeCompanies]);

  const setSelectedCompanyId = useCallback((companyId: string) => {
    setSelectedCompanyIdState(companyId);
    AsyncStorage.setItem(STORAGE_KEY, companyId);
  }, []);

  const reloadCompanies = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
  }, [queryClient]);

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string | null; budgetMonthlyCents?: number }) =>
      companiesApi.create(data),
    onSuccess: (company) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      setSelectedCompanyId(company.id);
    },
  });

  const createCompany = useCallback(
    async (data: { name: string; description?: string | null; budgetMonthlyCents?: number }) => {
      return createMutation.mutateAsync(data);
    },
    [createMutation],
  );

  const selectedCompany = useMemo(
    () => companies.find((c) => c.id === selectedCompanyId) ?? null,
    [companies, selectedCompanyId],
  );

  const value = useMemo(
    () => ({
      companies,
      selectedCompanyId,
      selectedCompany,
      loading: isLoading || !storageLoaded,
      setSelectedCompanyId,
      reloadCompanies,
      createCompany,
    }),
    [
      companies,
      selectedCompanyId,
      selectedCompany,
      isLoading,
      storageLoaded,
      setSelectedCompanyId,
      reloadCompanies,
      createCompany,
    ],
  );

  return (
    <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>
  );
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) {
    throw new Error("useCompany must be used within CompanyProvider");
  }
  return ctx;
}
