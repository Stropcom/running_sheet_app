import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DashboardLayout from "@/components/DashboardLayout";
import { Users, ShieldAlert, Crown, Eye, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const ROLE_CONFIG = {
  admin: { label: "Admin", icon: Crown, color: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/30" },
  certifier: { label: "Certifier", icon: ShieldCheck, color: "text-blue-400", bg: "bg-blue-400/10 border-blue-400/30" },
  observer: { label: "Observer", icon: Eye, color: "text-muted-foreground", bg: "bg-muted/50 border-border" },
};

export default function AdminPage() {
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();

  const { data: users, isLoading } = trpc.admin.listUsers.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
  });

  const updateRole = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => { utils.admin.listUsers.invalidate(); toast.success("Role updated"); },
    onError: (e) => toast.error(e.message),
  });

  if (!isAuthenticated) return null;

  if (user?.role !== "admin") {
    return (
      <DashboardLayout>
        <div className="p-6 lg:p-8 flex flex-col items-center justify-center min-h-[60vh]">
          <div className="p-4 rounded-2xl bg-destructive/10 mb-4">
            <ShieldAlert className="w-8 h-8 text-destructive" />
          </div>
          <p className="text-foreground font-medium">Access Denied</p>
          <p className="text-muted-foreground text-sm mt-1">Admin role required to access this page.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground">User Management</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Assign roles to control access levels across the application
          </p>
        </div>

        {/* Role descriptions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          {Object.entries(ROLE_CONFIG).map(([role, config]) => {
            const Icon = config.icon;
            return (
              <div key={role} className={`rounded-xl border p-4 ${config.bg}`}>
                <div className={`flex items-center gap-2 mb-2 ${config.color}`}>
                  <Icon className="w-4 h-4" />
                  <span className="font-semibold text-sm">{config.label}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {role === "admin" && "Full access: manage sheets, certify, uncertify, and manage users."}
                  {role === "certifier" && "Can certify and uncertify members, add rows and members."}
                  {role === "observer" && "Read-only access to view running sheets and audit logs."}
                </p>
              </div>
            );
          })}
        </div>

        {/* Users table */}
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          {isLoading ? (
            <div className="p-6 flex flex-col gap-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
            </div>
          ) : !users || users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="p-3 rounded-xl bg-muted/50 mb-3">
                <Users className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm">No users found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="running-sheet-table w-full">
                <thead>
                  <tr className="bg-muted/30">
                    <th>User</th>
                    <th className="w-32">Current Role</th>
                    <th className="w-44">Last Sign In</th>
                    <th className="w-44">Change Role</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const roleConf = ROLE_CONFIG[u.role as keyof typeof ROLE_CONFIG];
                    const RoleIcon = roleConf?.icon ?? Eye;
                    return (
                      <tr key={u.id} className="hover:bg-accent/20">
                        <td>
                          <div>
                            <p className="text-sm font-medium text-foreground">{u.name ?? "—"}</p>
                            <p className="text-xs text-muted-foreground">{u.email ?? u.openId}</p>
                          </div>
                        </td>
                        <td>
                          <Badge
                            variant="outline"
                            className={`gap-1.5 text-xs ${roleConf?.color ?? ""} ${roleConf?.bg ?? ""}`}
                          >
                            <RoleIcon className="w-3 h-3" />
                            {roleConf?.label ?? u.role}
                          </Badge>
                        </td>
                        <td>
                          <span className="text-xs text-muted-foreground font-mono">
                            {u.lastSignedIn ? format(new Date(u.lastSignedIn), "MMM d, yyyy HH:mm") : "—"}
                          </span>
                        </td>
                        <td>
                          {u.id !== user?.id ? (
                            <Select
                              value={u.role}
                              onValueChange={(val) =>
                                updateRole.mutate({
                                  userId: u.id,
                                  role: val as "observer" | "certifier" | "admin",
                                })
                              }
                            >
                              <SelectTrigger className="h-8 text-xs w-36">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="observer">Observer</SelectItem>
                                <SelectItem value="certifier">Certifier</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">You</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
