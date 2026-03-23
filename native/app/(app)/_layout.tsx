import { Stack } from "expo-router";
import { useCompany } from "../../hooks/useCompany";
import { useLiveUpdates } from "../../hooks/useLiveUpdates";

function LiveUpdatesConnector() {
  const { selectedCompanyId } = useCompany();
  useLiveUpdates(selectedCompanyId);
  return null;
}

export default function AppLayout() {
  return (
    <>
      <LiveUpdatesConnector />
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      />
    </>
  );
}
