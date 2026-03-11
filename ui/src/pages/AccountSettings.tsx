import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi } from "../api/auth";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "../components/PageSkeleton";

export function AccountSettings() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  const { data: session, isLoading } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });

  const [name, setName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    setBreadcrumbs([{ label: "Account" }]);
  }, [setBreadcrumbs]);

  useEffect(() => {
    if (session?.user?.name) setName(session.user.name);
  }, [session]);

  const nameDirty = !!session?.user && name !== (session.user.name ?? "");

  const updateNameMutation = useMutation({
    mutationFn: async (newName: string) => {
      const res = await fetch("/api/auth/update-user", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(
          (payload as { message?: string })?.message ?? `Failed (${res.status})`
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(
          (payload as { message?: string })?.message ?? `Failed (${res.status})`
        );
      }
    },
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
  });

  if (isLoading) return <PageSkeleton variant="settings" />;

  const passwordValid =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    newPassword === confirmPassword;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your profile and security settings.
        </p>
      </div>

      {/* Profile */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground ">
          Profile
        </h2>
        <div className="space-y-4 rounded-xl border border-border/50 px-4 py-4">
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <label className="text-sm font-medium">Name</label>
            </div>
            <input
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-ring focus-visible:ring-[3px]"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <label className="text-sm font-medium">Email</label>
            </div>
            <input
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none text-muted-foreground cursor-not-allowed"
              type="email"
              value={session?.user?.email ?? ""}
              disabled
            />
            <p className="mt-1 text-xs text-muted-foreground">Email cannot be changed.</p>
          </div>
        </div>
      </div>

      {nameDirty && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => updateNameMutation.mutate(name.trim())}
            disabled={updateNameMutation.isPending || !name.trim()}
          >
            {updateNameMutation.isPending ? "Saving..." : "Save changes"}
          </Button>
          {updateNameMutation.isSuccess && (
            <span className="text-sm text-muted-foreground">Saved</span>
          )}
          {updateNameMutation.isError && (
            <span className="text-sm text-destructive">
              {updateNameMutation.error instanceof Error
                ? updateNameMutation.error.message
                : "Failed to save"}
            </span>
          )}
        </div>
      )}

      {/* Password */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground ">
          Password
        </h2>
        <div className="space-y-4 rounded-xl border border-border/50 px-4 py-4">
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <label className="text-sm font-medium">Current password</label>
            </div>
            <input
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-ring focus-visible:ring-[3px]"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <label className="text-sm font-medium">New password</label>
            </div>
            <input
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-ring focus-visible:ring-[3px]"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Min. 8 characters"
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <label className="text-sm font-medium">Confirm new password</label>
            </div>
            <input
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-ring focus-visible:ring-[3px]"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="mt-1 text-xs text-destructive">Passwords do not match.</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() =>
            changePasswordMutation.mutate({
              currentPassword,
              newPassword,
            })
          }
          disabled={!passwordValid || changePasswordMutation.isPending}
        >
          {changePasswordMutation.isPending ? "Updating..." : "Change password"}
        </Button>
        {changePasswordMutation.isSuccess && (
          <span className="text-sm text-muted-foreground">Password updated</span>
        )}
        {changePasswordMutation.isError && (
          <span className="text-sm text-destructive">
            {changePasswordMutation.error instanceof Error
              ? changePasswordMutation.error.message
              : "Failed to update password"}
          </span>
        )}
      </div>
    </div>
  );
}
