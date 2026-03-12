import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi } from "../api/auth";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "../components/PageSkeleton";
import { Camera, Trash2, User } from "lucide-react";

export function AccountSettings() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const uploadAvatarMutation = useMutation({
    mutationFn: (file: File) => authApi.uploadAvatar(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
    },
  });

  const deleteAvatarMutation = useMutation({
    mutationFn: () => authApi.deleteAvatar(),
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

  function handleAvatarFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadAvatarMutation.mutate(file);
    // Reset so the same file can be re-selected
    e.target.value = "";
  }

  if (isLoading) return <PageSkeleton variant="settings" />;

  const passwordValid =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    newPassword === confirmPassword;

  const avatarUrl = session?.user?.image;
  const initials = (session?.user?.name ?? session?.user?.email ?? "?")
    .split(/[\s@]+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

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
          {/* Avatar */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <label className="text-sm font-medium">Avatar</label>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative group">
                <div className="w-16 h-16 rounded-full overflow-hidden bg-muted flex items-center justify-center border border-border">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-lg font-medium text-muted-foreground">
                      {initials || <User className="h-6 w-6" />}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                >
                  <Camera className="h-4 w-4 text-white" />
                </button>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadAvatarMutation.isPending}
                  >
                    {uploadAvatarMutation.isPending ? "Uploading..." : "Upload"}
                  </Button>
                  {avatarUrl && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteAvatarMutation.mutate()}
                      disabled={deleteAvatarMutation.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  JPG, PNG, WebP, or GIF. Max 2 MB.
                </p>
                {uploadAvatarMutation.isError && (
                  <p className="text-xs text-destructive">
                    {uploadAvatarMutation.error instanceof Error
                      ? uploadAvatarMutation.error.message
                      : "Upload failed"}
                  </p>
                )}
                {deleteAvatarMutation.isError && (
                  <p className="text-xs text-destructive">
                    {deleteAvatarMutation.error instanceof Error
                      ? deleteAvatarMutation.error.message
                      : "Failed to remove avatar"}
                  </p>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={handleAvatarFileChange}
              />
            </div>
          </div>

          {/* Name */}
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
