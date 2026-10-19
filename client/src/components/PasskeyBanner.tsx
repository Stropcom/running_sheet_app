/**
 * The warning shown after a password sign-in while the owner's "Require a
 * passkey for all users" is on and this person has none yet: how many password
 * sign-ins are left, and a button to set one up now. Renders nothing at all
 * while the requirement is off (the default), or once a passkey is set up.
 */
import { useState } from "react";
import { AlertTriangle, Fingerprint } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { PasskeySetupDialog } from "@/components/PasskeySetupDialog";
import { warningText } from "@shared/passkeyRules";

export function PasskeyBanner() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const { data } = trpc.passkey.status.useQuery(undefined, {
    enabled: !!user,
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  if (!user || !data?.warn) return null;
  const left = data.status.left ?? 0;
  return (
    <>
      <div
        role="alert"
        className={`mx-3 mt-3 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm sm:mx-4 ${
          left === 0
            ? "border-red-300 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300"
            : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
        }`}
      >
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <p className="min-w-0 flex-1">{warningText(left)}</p>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Fingerprint className="mr-1.5 h-4 w-4" />
          Set up passkey
        </Button>
      </div>
      <PasskeySetupDialog
        open={open}
        onOpenChange={setOpen}
        username={user.username}
      />
    </>
  );
}
