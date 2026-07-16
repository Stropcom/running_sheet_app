import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ShieldCheck, Loader2, Eye, EyeOff, Sun, Moon, AlertTriangle, RefreshCw } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { toast } from "sonner";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { theme, toggleTheme } = useTheme();

  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  // If already logged in, redirect to home
  const meQuery = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  useEffect(() => {
    if (meQuery.data) setLocation("/");
  }, [meQuery.data, setLocation]);

  const login = trpc.auth.login.useMutation({
    onSuccess: (result) => {
      setServerError(null);
      // Set auth cache immediately so DashboardLayout sees the user
      utils.auth.me.setData(undefined, result.user as any);
      setLocation("/");
    },
    onError: (e) => {
      const code = e.data?.code;
      const isServerDown =
        code === "INTERNAL_SERVER_ERROR" ||
        code === "TIMEOUT" ||
        e.message?.toLowerCase().includes("failed query") ||
        e.message?.toLowerCase().includes("connect") ||
        e.message?.toLowerCase().includes("unavailable") ||
        !code; // network error (no response at all)
      if (isServerDown) {
        setServerError("The server is temporarily unavailable. Please wait a moment and try again.");
      } else {
        setServerError(null);
        toast.error(e.message || "Invalid username or password.");
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      toast.error("Please enter both username and password.");
      return;
    }
    login.mutate({ username: username.trim(), password });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      {/* Subtle background grid */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="w-full max-w-sm relative z-10">
        {/* Logo / Brand */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-lg">
            <ShieldCheck className="w-7 h-7 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Running Sheet</h1>
            <p className="text-sm text-muted-foreground mt-1">Secure Operations Log</p>
          </div>
        </div>

        <Card className="border-border/60 shadow-xl shadow-black/20 bg-card/80 backdrop-blur">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-medium">Sign in to your account</CardTitle>
            <CardDescription className="text-xs">
              Enter your credentials to access the system.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {serverError && (
              <div className="mx-6 mt-4 flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 py-3 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold mb-0.5">Server unavailable</p>
                  <p className="text-amber-600/80 dark:text-amber-400/80">{serverError}</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setServerError(null); login.reset(); }}
                  className="shrink-0 text-amber-500/60 hover:text-amber-500 transition-colors"
                  title="Dismiss"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Username
                </Label>
                <Input
                  id="username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  placeholder="Enter username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={login.isPending}
                  className="bg-background/50 border-border/60 focus:border-primary/60 h-10"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={login.isPending}
                    className="bg-background/50 border-border/60 focus:border-primary/60 h-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-10 font-medium mt-2"
                disabled={login.isPending}
              >
                {login.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground/50 mt-6">
          Access restricted to authorised personnel only.
        </p>
        {toggleTheme && (
          <div className="flex justify-center mt-4">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
