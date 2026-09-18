import { useState } from "react";
import { useLocation } from "wouter";
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
  Loader2,
  ShieldCheck,
  Users,
  ShieldAlert,
  Crown,
  Eye,
  Archive,
  Binoculars,
} from "lucide-react";

export type Role = "observer" | "member" | "admin" | "investigator";

export const ROLE_COLORS: Record<Role, string> = {
  admin: "bg-red-500/15 text-red-400 border-red-500/30",
  member: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  observer: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  investigator: "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

export const ROLE_ICONS: Record<Role, React.ReactNode> = {
  admin: <Crown className="w-3 h-3" />,
  member: <ShieldCheck className="w-3 h-3" />,
  observer: <Eye className="w-3 h-3" />,
  investigator: <Binoculars className="w-3 h-3" />,
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  member: "Member",
  observer: "Observer",
  investigator: "Investigator",
};

// Archived-ness isn't a 4th `role` value (see archivedAt's own comment on
// the users table in drizzle/schema.ts) — this badge is presentational
// only, shown instead of the real role badge above whenever a row/profile
// is archived.
export const NONE_BADGE_CLASS =
  "bg-foreground/5 text-muted-foreground border-foreground/10";

export type TeamValue = "TEAM1" | "TEAM2" | "PTT" | undefined;

export interface UserFormData {
  name: string;
  cin: string;
  unit: string;
  team: TeamValue;
  phone: string;
  username: string;
  password: string;
  role: Role;
  /** Investigator role only — which operations this login can see. Ignored
   * (and cleared server-side) for every other role. */
  investigatorOperationIds: number[];
}

export const emptyForm = (): UserFormData => ({
  name: "",
  cin: "",
  unit: "",
  team: undefined,
  phone: "",
  username: "",
  password: "",
  role: "observer",
  investigatorOperationIds: [],
});

// ─── Form fields extracted OUTSIDE the parent component to prevent remounting ──
// This is the fix for the "one letter at a time" focus-loss bug.
// When defined inside the parent, React treats it as a new component type on every
// render and unmounts/remounts all inputs, losing focus after each keystroke.
export interface UserFormFieldsProps {
  form: UserFormData;
  setForm: React.Dispatch<React.SetStateAction<UserFormData>>;
  isEdit?: boolean;
  disabled?: boolean;
  /** Shown as a plain read-only line in place of the Access Level select —
   * used by the profile page while a user is archived, since their real
   * role is preserved underneath (not actually "none") but the admin UI
   * presents it as such. See archivedAt's comment in drizzle/schema.ts. */
  accessLevelOverride?: string;
}

export function UserFormFields({
  form,
  setForm,
  isEdit = false,
  disabled = false,
  accessLevelOverride,
}: UserFormFieldsProps) {
  return (
    <div className="grid gap-4 py-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Full Name *
          </Label>
          <Input
            placeholder="John Smith"
            value={form.name}
            disabled={disabled}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            CIN *
          </Label>
          <Input
            placeholder="ABC123"
            value={form.cin}
            disabled={disabled}
            onChange={e =>
              setForm(f => ({ ...f, cin: e.target.value.toUpperCase() }))
            }
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Unit
          </Label>
          <Input
            placeholder="e.g. Alpha Company"
            value={form.unit}
            disabled={disabled}
            onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Mobile Phone
          </Label>
          <Input
            placeholder="e.g. 0400 000 000"
            value={form.phone}
            disabled={disabled}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Team
        </Label>
        <Select
          value={form.team ?? "__none__"}
          disabled={disabled}
          onValueChange={v =>
            setForm(f => ({
              ...f,
              team: v === "__none__" ? undefined : (v as TeamValue),
            }))
          }
        >
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
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Username *
          </Label>
          <Input
            placeholder="jsmith"
            value={form.username}
            disabled={disabled}
            onChange={e =>
              setForm(f => ({ ...f, username: e.target.value.toLowerCase() }))
            }
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
            disabled={disabled}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Access Level *
        </Label>
        {accessLevelOverride ? (
          <div className="h-9 px-3 flex items-center rounded-md border border-input bg-muted/40 text-sm italic text-muted-foreground">
            {accessLevelOverride}
          </div>
        ) : (
          <Select
            value={form.role}
            disabled={disabled}
            onValueChange={v => setForm(f => ({ ...f, role: v as Role }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="investigator">
                Investigator — mapping page only, allocated operations
              </SelectItem>
              <SelectItem value="observer">Observer — view only</SelectItem>
              <SelectItem value="member">
                Full Access — own CIN certify only
              </SelectItem>
              <SelectItem value="admin">
                Full Access + User Management
              </SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
      {!accessLevelOverride && form.role === "investigator" && (
        <InvestigatorOperationPicker
          selected={form.investigatorOperationIds}
          disabled={disabled}
          onChange={ids =>
            setForm(f => ({ ...f, investigatorOperationIds: ids }))
          }
        />
      )}
    </div>
  );
}

/** Which operations an Investigator login can see — the server-side grant
 * this drives lives in users.investigatorOperationIds (see its comment in
 * drizzle/schema.ts); every map query substitutes this list server-side
 * regardless of what the client sends, so this picker is purely about
 * setting the grant, not itself part of the security boundary. */
function InvestigatorOperationPicker({
  selected,
  disabled,
  onChange,
}: {
  selected: number[];
  disabled?: boolean;
  onChange: (ids: number[]) => void;
}) {
  const { data: operations, isLoading } = trpc.operation.list.useQuery();
  const toggle = (id: number) => {
    onChange(
      selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]
    );
  };
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
        Allocated Operations *
      </Label>
      <div className="rounded-md border border-input max-h-44 overflow-y-auto divide-y divide-border/60">
        {isLoading ? (
          <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading operations…
          </div>
        ) : !operations?.length ? (
          <div className="p-3 text-sm text-muted-foreground">
            No operations exist yet.
          </div>
        ) : (
          operations.map(op => (
            <label
              key={op.id}
              className={`flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-accent/40 ${
                disabled ? "pointer-events-none opacity-60" : ""
              }`}
            >
              <input
                type="checkbox"
                className="accent-primary"
                checked={selected.includes(op.id)}
                disabled={disabled}
                onChange={() => toggle(op.id)}
              />
              {op.name}
            </label>
          ))
        )}
      </div>
      {selected.length === 0 && (
        <p className="text-xs text-destructive">
          Pick at least one operation — an Investigator with none granted sees
          an empty map.
        </p>
      )}
    </div>
  );
}

// ─── Main AdminPage component ──────────────────────────────────────────────────

export default function AdminPage() {
  const { user: currentUser, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: users, isLoading } = trpc.admin.listUsers.useQuery(undefined, {
    enabled: isAuthenticated && currentUser?.role === "admin",
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<UserFormData>(emptyForm());

  const createUser = trpc.admin.createUser.useMutation({
    onSuccess: () => {
      toast.success("User created successfully.");
      setCreateOpen(false);
      setForm(emptyForm());
      utils.admin.listUsers.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const handleCreate = () => {
    if (!form.name || !form.cin || !form.username || !form.password) {
      toast.error("Name, CIN, username, and password are required.");
      return;
    }
    if (
      form.role === "investigator" &&
      form.investigatorOperationIds.length === 0
    ) {
      toast.error("Pick at least one allocated operation for an Investigator.");
      return;
    }
    createUser.mutate(form);
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

  const archivedCount = users?.filter(u => u.archivedAt).length ?? 0;

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
              <h1 className="text-xl font-semibold text-foreground">
                User Management
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {users?.length ?? 0} registered user
                {(users?.length ?? 0) !== 1 ? "s" : ""}
                {archivedCount > 0 ? ` — ${archivedCount} archived` : ""}
              </p>
            </div>
          </div>
          <Button
            onClick={() => {
              setForm(emptyForm());
              setCreateOpen(true);
            }}
            size="sm"
            className="gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Add User
          </Button>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border/60 overflow-hidden bg-card/50 overflow-x-auto">
          <Table className="min-w-[600px]">
            <TableHeader>
              <TableRow className="border-border/60 bg-muted/30">
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Name
                </TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  CIN
                </TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium hidden sm:table-cell">
                  Unit
                </TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium hidden sm:table-cell">
                  Team
                </TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium hidden md:table-cell">
                  Username
                </TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Access Level
                </TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium hidden lg:table-cell">
                  Last Sign In
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center py-12 text-muted-foreground"
                  >
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : !users?.length ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center py-12 text-muted-foreground text-sm"
                  >
                    No users registered yet. Add the first user above.
                  </TableCell>
                </TableRow>
              ) : (
                users.map(u => {
                  const archived = !!u.archivedAt;
                  return (
                    <TableRow
                      key={u.id}
                      className={`border-border/40 hover:bg-accent/10 transition-colors ${archived ? "opacity-50" : ""}`}
                    >
                      <TableCell className="font-medium">
                        <button
                          onClick={() => navigate(`/admin/users/${u.id}`)}
                          className="text-primary hover:underline underline-offset-2 font-medium text-left"
                        >
                          {u.name}
                        </button>
                        {u.id === currentUser?.id && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            (you)
                          </span>
                        )}
                        {archived && (
                          <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10.5px] font-semibold uppercase tracking-wide border bg-foreground/5 text-muted-foreground border-foreground/10">
                            <Archive className="w-2.5 h-2.5" />
                            Archived
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm text-foreground/80">
                        {u.cin || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">
                        {u.unit || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">
                        {u.team ? u.team.replace("TEAM", "TEAM ") : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground hidden md:table-cell">
                        {u.username}
                      </TableCell>
                      <TableCell>
                        {archived ? (
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${NONE_BADGE_CLASS}`}
                          >
                            None
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${ROLE_COLORS[u.role as Role]}`}
                          >
                            {ROLE_ICONS[u.role as Role]}
                            {ROLE_LABELS[u.role as Role]}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">
                        {u.lastSignedIn
                          ? new Date(u.lastSignedIn).toLocaleString()
                          : "Never"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
          Click a name to open their profile — Edit and Archive both live there
          now.
        </p>

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
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={createUser.isPending}>
                {createUser.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Create User
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
