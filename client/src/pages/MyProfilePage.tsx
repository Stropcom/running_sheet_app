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
  Sun,
  Moon,
  Phone,
  ImageIcon,
  Trash2,
  Upload,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";
import { COLOR_PALETTES, DEFAULT_COLOR_PALETTE } from "@shared/const";

const ROLE_LABELS: Record<string, { label: string; color: string; badge: string }> = {
  admin:    { label: "Admin",    color: "text-amber-400",   badge: "border-amber-400/30 text-amber-400 bg-amber-400/10" },
  member:   { label: "Member",   color: "text-emerald-400", badge: "border-emerald-400/30 text-emerald-400 bg-emerald-400/10" },
  observer: { label: "Observer", color: "text-sky-400",     badge: "border-sky-400/30 text-sky-400 bg-sky-400/10"         },
};

// Representative swatch colours for each palette, matching index.css exactly
// (light-mode and dark-mode variants, since the picker should preview
// whichever mode the user is currently in).
const PALETTE_SWATCHES: Record<string, { light: string; dark: string }> = {
  blue: { light: "oklch(0.5 0.16 220)", dark: "oklch(0.72 0.14 220)" },
  sage: { light: "oklch(0.53 0.085 195)", dark: "oklch(0.7 0.075 195)" },
  "dusty-blue": { light: "oklch(0.53 0.075 235)", dark: "oklch(0.7 0.06 235)" },
  lavender: { light: "oklch(0.53 0.07 300)", dark: "oklch(0.7 0.06 300)" },
  sand: { light: "oklch(0.53 0.09 55)", dark: "oklch(0.7 0.05 55)" },
  pink: { light: "oklch(0.53 0.1 10)", dark: "oklch(0.7 0.08 10)" },
  slate: { light: "oklch(0.53 0.035 250)", dark: "oklch(0.7 0.02 250)" },
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
  const { theme, toggleTheme } = useTheme();

  // ── Accent colour palette ────────────────────────────────────────────────
  const [colorPalette, setColorPalette] = useState<string>(DEFAULT_COLOR_PALETTE);

  useEffect(() => {
    if (profile) {
      const p = profile as { colorPalette?: string | null };
      setColorPalette(p.colorPalette ?? DEFAULT_COLOR_PALETTE);
    }
  }, [profile]);

  const updateColorPaletteMutation = trpc.profile.updateColorPalette.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const handleSelectPalette = (id: string) => {
    setColorPalette(id);
    document.documentElement.dataset.palette = id;
    updateColorPaletteMutation.mutate({ palette: id });
  };

  // ── Wallpaper ─────────────────────────────────────────────────────────────
  const wallpaperInputRef = useRef<HTMLInputElement>(null);
  const [wallpaperPreview, setWallpaperPreview] = useState<string | null>(null);
  // persistedWallpaperUrl holds the URL returned by the server after a successful upload;
  // it acts as a stable fallback so the image doesn't vanish while profile.me refetches.
  const [persistedWallpaperUrl, setPersistedWallpaperUrl] = useState<string | null>(null);
  const [wallpaperOpacity, setWallpaperOpacity] = useState<number>(40);

  useEffect(() => {
    if (profile) {
      const p = profile as { wallpaperOpacity?: number | null; wallpaperUrl?: string | null };
      setWallpaperOpacity(p.wallpaperOpacity ?? 40);
      // Apply persisted wallpaper on load — also sync persistedWallpaperUrl
      if (p.wallpaperUrl) {
        setPersistedWallpaperUrl(p.wallpaperUrl);
        document.documentElement.style.setProperty("--wallpaper-url", `url(${p.wallpaperUrl})`);
        document.documentElement.style.setProperty("--wallpaper-opacity", String((100 - (p.wallpaperOpacity ?? 40)) / 100));
      } else {
        // Profile explicitly has no wallpaper — only clear if we haven't just uploaded one
        if (!persistedWallpaperUrl) {
          document.documentElement.style.removeProperty("--wallpaper-url");
          document.documentElement.style.removeProperty("--wallpaper-opacity");
        }
      }
    }
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  const uploadWallpaperMutation = trpc.profile.uploadWallpaper.useMutation({
    onSuccess: (data) => {
      toast.success("Wallpaper updated.");
      // Store the returned URL immediately so currentWallpaper stays non-null
      // even while profile.me is refetching
      setPersistedWallpaperUrl(data.url);
      setWallpaperPreview(null);
      document.documentElement.style.setProperty("--wallpaper-url", `url(${data.url})`);
      document.documentElement.style.setProperty("--wallpaper-opacity", String((100 - data.opacity) / 100));
      utils.profile.me.invalidate();
    },
    onError: (err) => {
      // Upload failed — clear the local preview so stale data-URL doesn't persist
      setWallpaperPreview(null);
      toast.error(`Wallpaper upload failed: ${err.message}`);
    },
  });

  const clearWallpaperMutation = trpc.profile.clearWallpaper.useMutation({
    onSuccess: () => {
      toast.success("Wallpaper removed.");
      setPersistedWallpaperUrl(null);
      setWallpaperPreview(null);
      document.documentElement.style.removeProperty("--wallpaper-url");
      document.documentElement.style.removeProperty("--wallpaper-opacity");
      utils.profile.me.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateOpacityMutation = trpc.profile.updateWallpaperOpacity.useMutation({
    onSuccess: () => {
      utils.profile.me.invalidate();
      document.documentElement.style.setProperty("--wallpaper-opacity", String((100 - wallpaperOpacity) / 100));
    },
  });

  const handleWallpaperFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setWallpaperPreview(dataUrl);
      const base64 = dataUrl.split(",")[1];
      uploadWallpaperMutation.mutate({ dataBase64: base64, mimeType: file.type, opacity: wallpaperOpacity });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // Priority: local preview (data-URL during upload) → server-returned URL (after upload, before refetch) → profile DB value
  const currentWallpaper = wallpaperPreview ?? persistedWallpaperUrl ?? (profile as { wallpaperUrl?: string | null } | undefined)?.wallpaperUrl ?? null;

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
              {[...Array(6)].map((_, i) => (
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
              <InfoRow icon={User}      label="Full Name"    value={profile?.name} />
              <InfoRow icon={Hash}      label="CIN"          value={profile?.cin} />
              <InfoRow icon={Building2} label="Unit"         value={profile?.unit} />
              <InfoRow icon={Phone}     label="Mobile Phone" value={(profile as { phone?: string | null } | undefined)?.phone} />
              <InfoRow icon={AtSign}    label="Username"     value={profile?.username} />
              <InfoRow icon={Shield}    label="Access Level" value={roleConf?.label} />
            </div>
          )}
        </div>

        {/* Appearance Card */}
        {toggleTheme && (
          <div className="rounded-xl border border-border bg-card p-6 mb-6 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
              {theme === "dark" ? <Moon className="w-4 h-4 text-primary" /> : <Sun className="w-4 h-4 text-primary" />}
              Appearance
            </h2>
            <p className="text-xs text-muted-foreground mb-4">Choose your preferred colour theme.</p>
            <div className="flex gap-3">
              <button
                onClick={() => theme !== "light" && toggleTheme()}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-all ${
                  theme === "light"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
                }`}
              >
                <Sun className="w-4 h-4" />
                Light
              </button>
              <button
                onClick={() => theme !== "dark" && toggleTheme()}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-all ${
                  theme === "dark"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
                }`}
              >
                <Moon className="w-4 h-4" />
                Dark
              </button>
            </div>

            <p className="text-xs text-muted-foreground mt-5 mb-3">Choose your accent colour.</p>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
              {COLOR_PALETTES.map((p) => {
                const swatch = PALETTE_SWATCHES[p.id][theme === "dark" ? "dark" : "light"];
                const selected = colorPalette === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => handleSelectPalette(p.id)}
                    className={`flex flex-col items-center justify-center gap-1.5 min-h-[76px] rounded-lg border px-2 py-2.5 text-xs font-medium text-center transition-all ${
                      selected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
                    }`}
                  >
                    <span
                      className="w-6 h-6 rounded-full border border-border/50 shrink-0"
                      style={{ backgroundColor: swatch }}
                    />
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Wallpaper Card */}
        <div className="rounded-xl border border-border bg-card p-6 mb-6 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-primary" />
            Background Wallpaper
          </h2>
          <p className="text-xs text-muted-foreground mb-4">Set a custom background image for all pages. Max 5 MB (JPEG, PNG, WebP).</p>

          {/* Preview */}
          {currentWallpaper ? (
            <div className="relative w-full h-28 rounded-lg overflow-hidden mb-4 border border-border">
              <img src={currentWallpaper} alt="Wallpaper preview" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black" style={{ opacity: (100 - wallpaperOpacity) / 100 }} />
              <span className="absolute bottom-2 left-2 text-[10px] text-white/80 bg-black/40 rounded px-1.5 py-0.5">Preview</span>
            </div>
          ) : (
            <div className="w-full h-28 rounded-lg border-2 border-dashed border-border flex items-center justify-center mb-4 bg-muted/20">
              <span className="text-xs text-muted-foreground">No wallpaper set</span>
            </div>
          )}

          {/* Opacity slider — only shown when a wallpaper is active */}
          {currentWallpaper && (
            <div className="mb-4">
              <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium block mb-2">
                Overlay darkness — {100 - wallpaperOpacity}%
              </label>
              <input
                type="range" min={0} max={100} step={5}
                value={100 - wallpaperOpacity}
                onChange={(e) => {
                  const darkness = Number(e.target.value);
                  const newOpacity = 100 - darkness;
                  setWallpaperOpacity(newOpacity);
                  document.documentElement.style.setProperty("--wallpaper-opacity", String(darkness / 100));
                }}
                onMouseUp={() => updateOpacityMutation.mutate({ opacity: wallpaperOpacity })}
                onTouchEnd={() => updateOpacityMutation.mutate({ opacity: wallpaperOpacity })}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                <span>Transparent</span><span>Dark</span>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-2">
            <input
              ref={wallpaperInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleWallpaperFile}
            />
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => wallpaperInputRef.current?.click()}
              disabled={uploadWallpaperMutation.isPending}
            >
              <Upload className="w-3.5 h-3.5" />
              {uploadWallpaperMutation.isPending ? "Uploading…" : currentWallpaper ? "Change Wallpaper" : "Upload Wallpaper"}
            </Button>
            {currentWallpaper && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => clearWallpaperMutation.mutate()}
                disabled={clearWallpaperMutation.isPending}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove
              </Button>
            )}
          </div>
        </div>

        {/* Change Password Card */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" />
            Change Password
          </h2>
          <p className="text-xs text-muted-foreground mb-5">
            Enter your current password to set a new one.
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
              placeholder="Enter new password"
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
