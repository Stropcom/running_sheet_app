import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  ShieldCheck,
  Loader2,
  Eye,
  EyeOff,
  Sun,
  Moon,
  AlertTriangle,
  RefreshCw,
  Fingerprint,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { toast } from "sonner";
import {
  browserSupportsWebAuthn,
  deviceHasPasskeyFor,
  guessDeviceKind,
  passkeyErrorMessage,
  rememberPasskeyUser,
  startAuthentication,
  startRegistration,
} from "@/lib/passkeyClient";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // Passkey login (off unless the owner switches it on): set when a correct
  // password is refused because the account has a passkey, or is locked.
  const [blocked, setBlocked] = useState<{
    kind: "has_passkey" | "locked";
    message: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  // If already logged in, redirect to home
  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (meQuery.data) setLocation("/");
  }, [meQuery.data, setLocation]);

  const passkeyLoginOptions = trpc.passkey.loginOptions.useMutation();
  const passkeyLogin = trpc.passkey.login.useMutation();
  const redeemOptions = trpc.passkey.redeemOptions.useMutation();
  const redeem = trpc.passkey.redeem.useMutation();

  const finishSignIn = (user: { mustChangePassword: boolean }) => {
    setServerError(null);
    setBlocked(null);
    // Set auth cache immediately so DashboardLayout sees the user
    utils.auth.me.setData(undefined, user as any);
    setLocation(user.mustChangePassword ? "/change-password" : "/");
  };

  const login = trpc.auth.login.useMutation({
    onSuccess: result => {
      if (!result.success) {
        setBlocked(result.blocked);
        return;
      }
      if (result.passkeyWarning) toast.warning(result.passkeyWarning.message);
      finishSignIn(result.user);
    },
    onError: e => {
      const code = e.data?.code;
      const isServerDown =
        code === "INTERNAL_SERVER_ERROR" ||
        code === "TIMEOUT" ||
        e.message?.toLowerCase().includes("failed query") ||
        e.message?.toLowerCase().includes("connect") ||
        e.message?.toLowerCase().includes("unavailable") ||
        !code; // network error (no response at all)
      if (isServerDown) {
        setServerError(
          "The server is temporarily unavailable. Please wait a moment and try again."
        );
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

  const signInWithPasskey = async () => {
    if (!username.trim()) {
      toast.error("Enter your username first.");
      return;
    }
    setPasskeyBusy(true);
    try {
      const { challengeId, options } = await passkeyLoginOptions.mutateAsync({
        username: username.trim(),
      });
      const response = await startAuthentication({ optionsJSON: options });
      const result = await passkeyLogin.mutateAsync({
        username: username.trim(),
        challengeId,
        response,
      });
      finishSignIn(result.user);
    } catch (e) {
      toast.error(passkeyErrorMessage(e));
    } finally {
      setPasskeyBusy(false);
    }
  };

  const registerWithCode = async () => {
    if (!username.trim() || !code.trim()) {
      toast.error("Enter your username and the code you were given.");
      return;
    }
    setPasskeyBusy(true);
    try {
      const { challengeId, options } = await redeemOptions.mutateAsync({
        username: username.trim(),
        code: code.trim(),
      });
      const response = await startRegistration({ optionsJSON: options });
      const kind = guessDeviceKind();
      const result = await redeem.mutateAsync({
        username: username.trim(),
        code: code.trim(),
        challengeId,
        response,
        deviceName:
          kind === "Laptop" ? "My laptop" : `My ${kind.toLowerCase()}`,
        deviceKind: kind,
      });
      rememberPasskeyUser(username);
      toast.success("Device registered. You are signed in.");
      finishSignIn(result.user);
    } catch (e) {
      toast.error(passkeyErrorMessage(e));
    } finally {
      setPasskeyBusy(false);
    }
  };

  // The passkey button only appears on a device where one was registered for
  // this username, or once the server says this account needs one.
  const showPasskeyButton =
    browserSupportsWebAuthn() &&
    (deviceHasPasskeyFor(username) || blocked?.kind === "has_passkey");

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
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Running Sheet
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Secure Operations Log
            </p>
          </div>
        </div>

        <Card className="border-border shadow-xl shadow-black/20 bg-card shadow-sm backdrop-blur">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-medium">
              Sign in to your account
            </CardTitle>
            <CardDescription className="text-xs">
              Enter your credentials to access the system.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {serverError && (
              <div className="mx-6 mt-4 flex items-start gap-2.5 rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-3.5 py-3 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold mb-0.5">Server unavailable</p>
                  <p className="text-amber-600/80 dark:text-amber-400/80">
                    {serverError}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setServerError(null);
                    login.reset();
                  }}
                  className="shrink-0 text-amber-700 dark:text-amber-300 hover:text-amber-500 transition-colors"
                  title="Dismiss"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label
                  htmlFor="username"
                  className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
                >
                  Username
                </Label>
                <Input
                  id="username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  placeholder="Enter username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  disabled={login.isPending}
                  className="bg-background border-border focus:border-primary/60 h-10"
                />
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="password"
                  className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
                >
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    disabled={login.isPending}
                    className="bg-background border-border focus:border-primary/60 h-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
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
              {showPasskeyButton && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-10 font-medium"
                  disabled={passkeyBusy || login.isPending}
                  onClick={signInWithPasskey}
                >
                  {passkeyBusy ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Fingerprint className="w-4 h-4 mr-2" />
                  )}
                  Sign in with passkey
                </Button>
              )}
            </form>
            {blocked && (
              <div className="mt-4 space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                <p className="font-semibold">
                  {blocked.kind === "locked"
                    ? "Your account is locked"
                    : "Passkey required"}
                </p>
                <p>{blocked.message}</p>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="passkey-code"
                    className="text-xs font-medium uppercase tracking-wider"
                  >
                    I have a one-time code
                  </Label>
                  <Input
                    id="passkey-code"
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    placeholder="XXXX-XXXX"
                    maxLength={9}
                    autoComplete="off"
                    className="bg-background border-border h-10 text-center font-mono text-base uppercase tracking-widest"
                  />
                </div>
                <Button
                  type="button"
                  className="w-full h-10 font-medium"
                  disabled={passkeyBusy}
                  onClick={registerWithCode}
                >
                  {passkeyBusy ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Fingerprint className="w-4 h-4 mr-2" />
                  )}
                  Register this device
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Access restricted to authorised personnel only.
        </p>
        {toggleTheme && (
          <div className="flex justify-center mt-4">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-muted-foreground transition-colors"
            >
              {theme === "dark" ? (
                <Sun className="w-3.5 h-3.5" />
              ) : (
                <Moon className="w-3.5 h-3.5" />
              )}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
