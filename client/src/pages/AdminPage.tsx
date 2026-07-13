import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  UserPlus,
  Pencil,
  Trash2,
  Loader2,
  ShieldCheck,
  Users,
  ShieldAlert,
  Crown,
  Eye,
  Wrench,
  CheckCircle2,
} from "lucide-react";

type Role = "observer" | "member" | "admin";

const ROLE_COLORS: Record<Role, string> = {
  admin: "bg-red-500/15 text-red-400 border-red-500/30",
  member: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  observer: "bg-sky-500/15 text-sky-400 border-sky-500/30",
};

const ROLE_ICONS: Record<Role, React.ReactNode> = {
  admin: <Crown className="w-3 h-3" />,
  member: <ShieldCheck className="w-3 h-3" />,
  observer: <Eye className="w-3 h-3" />,
};

type TeamValue = "TEAM1" | "TEAM2" | "PTT" | undefined;

interface UserFormData {
  name: string;
  cin: string;
  unit: string;
  team: TeamValue;
  username: string;
  password: string;
  role: Role;
}

const emptyForm = (): UserFormData => ({
  name: "",
  cin: "",
  unit: "",
  team: undefined,
  username: "",
  password: "",
  role: "observer",
});

// ─── Form fields extracted OUTSIDE the parent component to prevent remounting ──
// This is the fix for the "one letter at a time" focus-loss bug.
// When defined inside the parent, React treats it as a new component type on every
// render and unmounts/remounts all inputs, losing focus after each keystroke.
interface UserFormFieldsProps {
  form: UserFormData;
  setForm: React.Dispatch<React.SetStateAction<UserFormData>>;
  isEdit?: boolean;
}

function UserFormFields({ form, setForm, isEdit = false }: UserFormFieldsProps) {
  return (
    <div className="grid gap-4 py-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Full Name *</Label>
          <Input
            placeholder="John Smith"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">CIN *</Label>
          <Input
            placeholder="ABC123"
            value={form.cin}
            onChange={(e) => setForm((f) => ({ ...f, cin: e.target.value.toUpperCase() }))}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Unit</Label>
        <Input
          placeholder="e.g. Alpha Company"
          value={form.unit}
          onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Team</Label>
        <Select value={form.team ?? "__none__"} onValueChange={(v) => setForm((f) => ({ ...f, team: v === "__none__" ? undefined : v as TeamValue }))}>
          <SelectTrigger>
            <SelectValue placeholder="Select team (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— None —</SelectItem>
            <SelectItem value="TEAM1">TEAM 1</SelectItem>
            <SelectItem value="TEAM2">TEAM 2</SelectItem>
            <SelectItem value="PTT">PTT</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Username *</Label>
          <Input
            placeholder="jsmith"
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.toLowerCase() }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            {isEdit ? "New Password" : "Password *"}
          </Label>
          <Input
            type="password"
            placeholder={isEdit ? "Leave blank to keep" : "Enter password"}
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Access Level *</Label>
        <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as Role }))}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="observer">Observer — view only</SelectItem>
            <SelectItem value="member">Full Access — own CIN certify only</SelectItem>
            <SelectItem value="admin">Full Access + User Management</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ─── Main AdminPage component ──────────────────────────────────────────────────

export default function AdminPage() {
  const { user: currentUser, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();

  const { data: users, isLoading } = trpc.admin.listUsers.useQuery(undefined, {
    enabled: isAuthenticated && currentUser?.role === "admin",
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<NonNullable<typeof users>[0] | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [form, setForm] = useState<UserFormData>(emptyForm());

  const invalidate = () => utils.admin.listUsers.invalidate();

  const createUser = trpc.admin.createUser.useMutation({
    onSuccess: () => {
      toast.success("User created successfully.");
      setCreateOpen(false);
      setForm(emptyForm());
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateUser = trpc.admin.updateUser.useMutation({
    onSuccess: () => {
      toast.success("User updated successfully.");
      setEditTarget(null);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const [backfillResult, setBackfillResult] = useState<{ scanned: number; updated: number } | null>(null);

  const backfillGoogleAddresses = trpc.adminUtils.backfillGoogleAddresses.useMutation({
    onSuccess: (result) => {
      setBackfillResult(result);
      toast.success(`Done — ${result.updated} row${result.updated !== 1 ? 's' : ''} updated out of ${result.scanned} scanned.`);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteUser = trpc.admin.deleteUser.useMutation({
    onSuccess: () => {
      toast.success("User deleted.");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleCreate = () => {
    if (!form.name || !form.cin || !form.username || !form.password) {
      toast.error("Name, CIN, username, and password are required.");
      return;
    }
    createUser.mutate(form);
  };

  const handleUpdate = () => {
    if (!editTarget) return;
    const payload: Parameters<typeof updateUser.mutate>[0] = { id: editTarget.id };
    if (form.name) payload.name = form.name;
    if (form.cin) payload.cin = form.cin;
    payload.unit = form.unit;
    payload.team = form.team ?? null;
    if (form.username) payload.username = form.username;
    if (form.password) payload.password = form.password;
    payload.role = form.role;
    updateUser.mutate(payload);
  };

  const openEdit = (u: NonNullable<typeof users>[0]) => {
    setEditTarget(u);
    setForm({
      name: u.name ?? "",
      cin: u.cin ?? "",
      unit: u.unit ?? "",
      team: (u.team as TeamValue) ?? undefined,
      username: u.username ?? "",
      password: "",
      role: (u.role as Role) ?? "observer",
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
          <p className="text-muted-foreground text-sm mt-1">Admin role required.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Users className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">User Management</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {users?.length ?? 0} registered user{(users?.length ?? 0) !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <Button
            onClick={() => { setForm(emptyForm()); setCreateOpen(true); }}
            size="sm"
            className="gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Add User
          </Button>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border/60 overflow-hidden bg-card/50">
          <Table>
            <TableHeader>
              <TableRow className="border-border/60 bg-muted/30">
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Name</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">CIN</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Unit</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Team</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Username</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Access Level</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Last Sign In</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : !users?.length ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                    No users registered yet. Add the first user above.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u) => (
                  <TableRow key={u.id} className="border-border/40 hover:bg-accent/10 transition-colors">
                    <TableCell className="font-medium text-foreground">
                      {u.name}
                      {u.id === currentUser?.id && (
                        <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-foreground/80">{u.cin || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.unit || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.team ? u.team.replace("TEAM", "TEAM ") : "—"}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{u.username}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${ROLE_COLORS[u.role as Role]}`}
                      >
                        {ROLE_ICONS[u.role as Role]}
                        {u.role}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleString() : "Never"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => openEdit(u)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        {u.id !== currentUser?.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteTarget(u.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Create Dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="w-4 h-4" />
                Add New User
              </DialogTitle>
            </DialogHeader>
            <UserFormFields form={form} setForm={setForm} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createUser.isPending}>
                {createUser.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Create User
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="w-4 h-4" />
                Edit User — {editTarget?.name}
              </DialogTitle>
            </DialogHeader>
            <UserFormFields form={form} setForm={setForm} isEdit />
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
              <Button onClick={handleUpdate} disabled={updateUser.isPending}>
                {updateUser.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Data Tools Section */}
        <div className="mt-8 rounded-xl border border-border/60 bg-card/50 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Wrench className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Data Tools</h2>
              <p className="text-xs text-muted-foreground">One-time maintenance utilities for existing data.</p>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-4 rounded-lg border border-border/40 bg-background/50 p-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Fix Google Maps Addresses</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Scans all existing running sheet observations and converts any Google Maps formatted addresses
                  (e.g. "131 Lakey St, Southern River WA 6110, Australia") into the standard running sheet format
                  (e.g. "131 Lakey St, Southern River WA (131 LAKEY ST)") so they are picked up by the intelligence extractor.
                </p>
                {backfillResult && (
                  <div className="flex items-center gap-2 mt-2 text-xs text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Last run: {backfillResult.updated} row{backfillResult.updated !== 1 ? 's' : ''} updated out of {backfillResult.scanned} scanned.</span>
                  </div>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                onClick={() => backfillGoogleAddresses.mutate()}
                disabled={backfillGoogleAddresses.isPending}
              >
                {backfillGoogleAddresses.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Wrench className="w-3.5 h-3.5" />
                )}
                {backfillGoogleAddresses.isPending ? "Running…" : "Run Now"}
              </Button>
            </div>
          </div>
        </div>

        {/* Delete Confirm Dialog */}
        <Dialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2">
                <Trash2 className="w-4 h-4" />
                Delete User
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground py-2">
              This action cannot be undone. The user will lose all access immediately.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => deleteTarget !== null && deleteUser.mutate({ id: deleteTarget })}
                disabled={deleteUser.isPending}
              >
                {deleteUser.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Delete User
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
