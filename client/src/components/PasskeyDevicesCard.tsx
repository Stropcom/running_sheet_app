/**
 * Profile → My devices: the passkeys registered for this account. Shown only
 * when the owner's requirement is on, or this person already has a device —
 * while the feature is off, and nobody has set one up, it isn't there.
 */
import { useState } from "react";
import { Copy, Fingerprint, Laptop, Smartphone, Tablet } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { PasskeySetupDialog } from "@/components/PasskeySetupDialog";
import {
  FIELD_LABEL,
  ROW_ITEM,
  SECTION_BAND,
  SECTION_CARD,
  SECTION_COUNT,
  SECTION_TITLE,
} from "@/lib/pageKit";
import { PasskeyStatusPill } from "@/components/PasskeyStatusPill";
import { formatPerth } from "@/lib/passkeyFormat";

const KIND_ICON = {
  Phone: Smartphone,
  Tablet: Tablet,
  Laptop: Laptop,
} as const;

export function PasskeyDevicesCard() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data } = trpc.passkey.status.useQuery(undefined, {
    enabled: !!user,
    retry: false,
  });
  const [setup, setSetup] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [code, setCode] = useState<{ code: string; expiresAt: number } | null>(
    null
  );
  const remove = trpc.passkey.removeMyDevice.useMutation({
    onSuccess: () => {
      setConfirmId(null);
      utils.passkey.status.invalidate();
      toast.success("Device removed. It can no longer sign in.");
    },
    onError: e => toast.error(e.message),
  });
  const selfCode = trpc.passkey.selfCode.useMutation({
    onSuccess: r => setCode(r),
    onError: e => toast.error(e.message),
  });
  if (!user || !data?.visible) return null;
  const full = data.devices.length >= data.maxDevices;

  return (
    <section className={SECTION_CARD}>
      <div className={SECTION_BAND}>
        <Fingerprint className="h-4 w-4 text-muted-foreground" />
        <h2 className={SECTION_TITLE}>My devices</h2>
        <span className={SECTION_COUNT}>
          {data.devices.length} of {data.maxDevices}
        </span>
        <span className="ml-auto">
          <PasskeyStatusPill status={data.status} />
        </span>
      </div>

      {data.devices.length === 0 ? (
        <p className="mb-3 text-sm text-muted-foreground">
          No passkey yet. Set one up on this device so your password alone is
          never enough to get into your account.
        </p>
      ) : (
        <ul className="mb-3 space-y-2">
          {data.devices.map(d => {
            const Icon = KIND_ICON[d.kind as keyof typeof KIND_ICON] ?? Laptop;
            return (
              <li
                key={d.id}
                className={`${ROW_ITEM} flex flex-wrap items-center gap-3 px-3 py-2.5`}
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{d.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Added {formatPerth(d.createdAt)}
                    {d.lastUsedAt
                      ? ` · last used ${formatPerth(d.lastUsedAt)}`
                      : ""}
                  </div>
                </div>
                {confirmId === d.id ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmId(null)}
                    >
                      Keep
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => remove.mutate({ id: d.id })}
                      disabled={remove.isPending}
                    >
                      Confirm remove
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600"
                    onClick={() => setConfirmId(d.id)}
                  >
                    Remove
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <Button onClick={() => setSetup(true)} disabled={full}>
          Add this device
        </Button>
        <Button
          variant="outline"
          onClick={() => selfCode.mutate()}
          disabled={data.devices.length === 0 || selfCode.isPending}
        >
          Get a code to add another device
        </Button>
      </div>
      {full && (
        <p className="mt-2 text-xs text-muted-foreground">
          You have reached the limit of {data.maxDevices}. Remove a device to
          add another.
        </p>
      )}

      {code && (
        <div className="mt-3 rounded-lg border border-border bg-background p-3">
          <div className={FIELD_LABEL}>Add-device code</div>
          <div className="my-1 flex items-center gap-2">
            <span className="font-mono text-2xl font-bold tracking-[0.12em]">
              {code.code}
            </span>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Copy code"
              onClick={() => {
                navigator.clipboard?.writeText(code.code).catch(() => {});
                toast.success("Copied");
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            On the new device, open RunLog, choose "I have a code", and type
            this. It works once and runs out at {formatPerth(code.expiresAt)}.
          </p>
        </div>
      )}

      <PasskeySetupDialog
        open={setup}
        onOpenChange={setSetup}
        username={user.username}
      />
    </section>
  );
}
