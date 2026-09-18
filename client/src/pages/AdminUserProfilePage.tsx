import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  ShieldAlert,
  Archive,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import {
  UserFormFields,
  NONE_BADGE_CLASS,
  emptyForm,
  type Role,
  type UserFormData,
  type TeamValue,
} from "@/pages/AdminPage";

export default function AdminUserProfilePage() {
  const { user: currentUser, isAuthenticated } = useAuth();
  const params = useParams<{ id: string }>();
  const userId = parseInt(params.id ?? "0", 10);
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: profile, isLoading } = trpc.admin.getUser.useQuery(
    { id: userId },
    { enabled: isAuthenticated && currentUser?.role === "admin" && !!userId }
  );

  const [form, setForm] = useState<UserFormData>(emptyForm());
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    if (profile) {
      let investigatorOperationIds: number[] = [];
      if (profile.investigatorOperationIds) {
        try {
          const parsed = JSON.parse(profile.investigatorOperationIds);
          if (Array.isArray(parsed)) investigatorOperationIds = parsed;
        } catch {
          /* ignore malformed value, treat as no grant */
        }
      }
      setForm({
        name: profile.name ?? "",
        cin: profile.cin ?? "",
        unit: profile.unit ?? "",
        team: (profile.team as TeamValue) ?? undefined,
        phone: profile.phone ?? "",
        username: profile.username ?? "",
        password: "",
        role: (profile.role as Role) ?? "observer",
        investigatorOperationIds,
      });
    }
  }, [profile]);

  const updateUser = trpc.admin.updateUser.useMutation({
    onSuccess: () => {
      toast.success("Profile updated.");
      utils.admin.getUser.invalidate({ id: userId });
      utils.admin.listUsers.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const archiveUser = trpc.admin.archiveUser.useMutation({
    onSuccess: () => {
      toast.success(`${profile?.name} archived.`);
      setArchiveConfirmOpen(false);
      utils.admin.getUser.invalidate({ id: userId });
      utils.admin.listUsers.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const restoreUser = trpc.admin.restoreUser.useMutation({
    onSuccess: () => {
      toast.success(`${profile?.name} restored.`);
      utils.admin.getUser.invalidate({ id: userId });
      utils.admin.listUsers.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const deleteUser = trpc.admin.deleteUser.useMutation({
    onSuccess: () => {
      toast.success("User deleted permanently.");
      navigate("/admin");
      utils.admin.listUsers.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const handleSave = () => {
    if (!form.name || !form.cin || !form.username) {
      toast.error("Name, CIN, and username are required.");
      return;
    }
    if (
      form.role === "investigator" &&
      form.investigatorOperationIds.length === 0
    ) {
      toast.error("Pick at least one allocated operation for an Investigator.");
      return;
    }
    updateUser.mutate({
      id: userId,
      name: form.name,
      cin: form.cin,
      unit: form.unit,
      team: form.team ?? null,
      phone: form.phone || null,
      username: form.username,
      password: form.password || undefined,
      role: form.role,
      investigatorOperationIds: form.investigatorOperationIds,
    });
  };

  if (!isAuthenticated) return null;

  if (currentUser?.role !== "admin") {
    return (
      <DashboardLayout>
        <div className="p-6 flex flex-col items-center justify-center min-h-[60vh]">
          <div className="p-4 rounded-2xl bg-destructive/10 mb-4">
            <ShieldAlert className="w-8 h-8 text-destructive" />
          </div>
          <p className="text-foreground font-medium">Access Denied</p>
          <p className="text-muted-foreground text-sm mt-1">
            Admin role required.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  if (isLoading || !profile) {
    return (
      <DashboardLayout>
        <div className="p-6 max-w-2xl mx-auto flex items-center justify-center min-h-[40vh]">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  const archived = !!profile.archivedAt;
  const isSelf = profile.id === currentUser?.id;

  return (
    <DashboardLayout>
      <div className="p-6 max-w-2xl mx-auto flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => navigate("/admin")}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1
              className={`text-lg font-semibold ${archived ? "text-muted-foreground" : "text-foreground"}`}
            >
              {profile.name}
              {isSelf && (
                <span className="ml-2 text-xs text-muted-foreground font-normal">
                  (you)
                </span>
              )}
            </h1>
            <p className="text-xs text-muted-foreground font-mono">
              CIN {profile.cin}
            </p>
          </div>
          <span
            className={`ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
              archived
                ? NONE_BADGE_CLASS
                : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
            }`}
          >
            {archived ? (
              <Archive className="w-3 h-3" />
            ) : (
              <CheckCircle2 className="w-3 h-3" />
            )}
            {archived ? "Archived" : "Active"}
          </span>
        </div>

        {/* Profile fields */}
        <div className="rounded-xl border border-border/60 bg-card/50 p-5">
          <p className="text-sm font-semibold mb-1">Profile</p>
          <UserFormFields
            form={form}
            setForm={setForm}
            isEdit
            disabled={archived}
            accessLevelOverride={archived ? "None — set by Archive" : undefined}
          />
          {archived ? (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
              Fields are read-only while archived — restore the account to edit
              them.
            </p>
          ) : (
            <div className="flex justify-end pt-2">
              <Button onClick={handleSave} disabled={updateUser.isPending}>
                {updateUser.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Save Changes
              </Button>
            </div>
          )}
        </div>

        {/* Account status / archive selector — the last thing on the page */}
        <div className="rounded-xl border border-border/60 bg-card/50 p-5 flex flex-col gap-3">
          <p className="text-sm font-semibold">Account Status</p>
          {isSelf ? (
            <p className="text-xs text-muted-foreground">
              You can't archive your own account.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">
                    {archived ? "Archived" : "Active"}
                  </span>
                  <span className="text-xs text-muted-foreground max-w-sm">
                    {archived
                      ? "Signed out, Access Level set to None. Everything already on record — rows, certifications, statements, witness lists — is untouched."
                      : "Can log in, and appears when adding members to a team, operation or running sheet."}
                  </span>
                </div>
                <Switch
                  checked={archived}
                  onCheckedChange={checked => {
                    if (checked) setArchiveConfirmOpen(true);
                    else restoreUser.mutate({ id: userId });
                  }}
                  disabled={archiveUser.isPending || restoreUser.isPending}
                />
              </div>
              {archived && (
                <>
                  <div className="h-px bg-border/60" />
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-muted-foreground">
                      Nobody's coming back for this account?
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteConfirmOpen(true)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Permanently
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Archive confirm */}
        <Dialog open={archiveConfirmOpen} onOpenChange={setArchiveConfirmOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Archive className="w-4 h-4" />
                Archive {profile.name}?
              </DialogTitle>
            </DialogHeader>
            <div className="text-sm text-muted-foreground space-y-2 py-1">
              <p>
                They'll lose the ability to log in and won't appear when adding
                members to a team, operation or running sheet.
              </p>
              <p>
                Everything already on record is unaffected, and this is
                reversible any time from this page.
              </p>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setArchiveConfirmOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => archiveUser.mutate({ id: userId })}
                disabled={archiveUser.isPending}
                className="gap-1.5"
              >
                {archiveUser.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Archive className="w-3.5 h-3.5" />
                )}
                Archive User
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirm */}
        <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2">
                <Trash2 className="w-4 h-4" />
                Delete {profile.name} Permanently
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground py-2">
              This action cannot be undone — unlike Archive, it can't be
              reversed from here.
            </p>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteConfirmOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteUser.mutate({ id: userId })}
                disabled={deleteUser.isPending}
                className="gap-1.5"
              >
                {deleteUser.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Delete Permanently
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
