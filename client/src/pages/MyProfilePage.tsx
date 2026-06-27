import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import DashboardLayout from "@/components/DashboardLayout";
import {
  User,
  Shield,
  Building2,
  Hash,
  AtSign,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const ROLE_LABELS: Record<string, { label: string; color: string; badge: string }> = {
  admin:     { label: "Admin",     color: "text-violet-400", badge: "border-violet-400/30 text-violet-400 bg-violet-400/10" },
  certifier: { label: "Certifier", color: "text-amber-400",  badge: "border-amber-400/30 text-amber-400 bg-amber-400/10"   },
  observer:  { label: "Observer",  color: "text-sky-400",    badge: "border-sky-400/30 text-sky-400 bg-sky-400/10"         },
};

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) {
  return (
    <div className="flex items-start gap-4 py-3.5 border-b border-border/50 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-0.5">{label}</p>
        <p className="text-sm font-medium text-foreground truncate">{value || <span className="text-muted-foreground italic">Not set</span>}</p>
      </div>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{label}</label>
      <div className="relative">
        <Input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`pr-10 ${error ? "border-destructive focus-visible:ring-destructive" : ""}`}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          tabIndex={-1}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export default function MyProfilePage() {
  const { isAuthenticated } = useAuth({ redirectOnUnauthenticated: true });
  const utils = trpc.useUtils();

  const { data: profile, isLoading } = trpc.profile.me.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  const updatePasswordMutation = trpc.profile.updatePassword.useMutation({
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setFieldErrors({});
      setSuccess(true);
      toast.success("Password updated successfully.");
      utils.profile.me.invalidate();
      setTimeout(() => setSuccess(false), 4000);
    },
    onError: (err) => {
      const msg = err.message;
      if (msg.includes("Current password")) {
        setFieldErrors({ currentPassword: msg });
      } else if (msg.includes("do not match")) {
        setFieldErrors({ confirmPassword: msg });
      } else if (msg.includes("6 characters")) {
        setFieldErrors({ newPassword: msg });
      } else {
        toast.error(msg);
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setSuccess(false);

    const errors: Record<string, string> = {};
    if (!currentPassword) errors.currentPassword = "Current password is required.";
    if (!newPassword) errors.newPassword = "New password is required.";
    else if (newPassword.length < 6) errors.newPassword = "New password must be at least 6 characters.";
    if (!confirmPassword) errors.confirmPassword = "Please confirm your new password.";
    else if (newPassword && confirmPassword && newPassword !== confirmPassword)
      errors.confirmPassword = "Passwords do not match.";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    updatePasswordMutation.mutate({ currentPassword, newPassword, confirmPassword });
  };

  const roleConf = ROLE_LABELS[(profile?.role as string) ?? "observer"];

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <span className="text-2xl font-bold text-primary">
              {profile?.name?.charAt(0).toUpperCase() ?? "?"}
            </span>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {isLoading ? <Skeleton className="h-7 w-40" /> : (profile?.name ?? "My Profile")}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              {isLoading ? (
                <Skeleton className="h-5 w-20" />
              ) : (
                <Badge variant="outline" className={`text-xs gap-1 ${roleConf?.badge}`}>
                  <Shield className="w-3 h-3" />
                  {roleConf?.label}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Profile Information Card */}
        <div className="rounded-xl border border-border bg-card p-6 mb-6 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
            <User className="w-4 h-4 text-primary" />
            Profile Information
          </h2>
          <p className="text-xs text-muted-foreground mb-4">Your account details as set by an administrator.</p>

          {isLoading ? (
            <div className="flex flex-col gap-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="w-8 h-8 rounded-lg" />
                  <div className="flex-1">
                    <Skeleton className="h-3 w-16 mb-1.5" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div>
              <InfoRow icon={User}      label="Full Name" value={profile?.name} />
              <InfoRow icon={Hash}      label="CIN"       value={profile?.cin} />
              <InfoRow icon={Building2} label="Unit"      value={profile?.unit} />
              <InfoRow icon={AtSign}    label="Username"  value={profile?.username} />
              <InfoRow icon={Shield}    label="Access Level" value={roleConf?.label} />
            </div>
          )}
        </div>

        {/* Change Password Card */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" />
            Change Password
          </h2>
          <p className="text-xs text-muted-foreground mb-5">
            Choose a strong password of at least 6 characters.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <PasswordField
              label="Current Password"
              value={currentPassword}
              onChange={setCurrentPassword}
              placeholder="Enter your current password"
              error={fieldErrors.currentPassword}
            />
            <PasswordField
              label="New Password"
              value={newPassword}
              onChange={setNewPassword}
              placeholder="At least 6 characters"
              error={fieldErrors.newPassword}
            />
            <PasswordField
              label="Confirm New Password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="Re-enter new password"
              error={fieldErrors.confirmPassword}
            />

            {success && (
              <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-lg px-3 py-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Password updated successfully.
              </div>
            )}

            <Button
              type="submit"
              className="w-full mt-1"
              disabled={updatePasswordMutation.isPending}
            >
              {updatePasswordMutation.isPending ? "Updating…" : "Update Password"}
            </Button>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}
