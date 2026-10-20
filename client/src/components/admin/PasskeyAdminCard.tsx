/**
 * Passkey login, in Access Management. Admins see the people they look after
 * (their own Command; the owner and an all-region admin see everyone) with a
 * status, and can issue a one-time code or remove a device. Only the owner
 * sees the master switch, the allowance and the exemptions.
 *
 * Off until the owner ticks "Require a passkey for all users": while it is off
 * nobody is blocked, and nobody but the owner and admins sees anything.
 */
import { useState } from "react";
import { ChevronRight, Copy, Fingerprint, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PasskeySetupDialog } from "@/components/PasskeySetupDialog";
import { PasskeyStatusPill } from "@/components/PasskeyStatusPill";
import { formatPerth } from "@/lib/passkeyFormat";
import { FORM_CONFIRM_BUTTON, FORM_LABEL } from "@/lib/formKit";
import {
  FIELD_LABEL,
  ROW_ITEM,
  SECTION_BAND,
  SECTION_CARD,
  SECTION_COUNT,
  SECTION_TITLE,
} from "@/lib/pageKit";
import {
  ADMIN_CODE_MINUTES,
  PASSWORD_SIGNINS_CHOICES,
} from "@shared/passkeyRules";
import { COMMAND_LABELS, type CommandCode } from "@shared/commands";

export function PasskeyAdminCard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();
  const { data } = trpc.passkey.people.useQuery(undefined, {
    enabled: isAdmin,
    retry: false,
    refetchInterval: 30_000,
  });
  // Closed whenever the page opens: the card is long and rarely needed.
  const [open, setOpen] = useState(false);
  const [confirmOn, setConfirmOn] = useState(false);
  const [issuing, setIssuing] = useState<number | null>(null);
  const [verified, setVerified] = useState(false);
  const [shown, setShown] = useState<
    Record<number, { code: string; expiresAt: number }>
  >({});
  const [devicesFor, setDevicesFor] = useState<number | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  const [setup, setSetup] = useState(false);

  const refresh = () => {
    utils.passkey.people.invalidate();
    utils.passkey.status.invalidate();
  };
  const setSettings = trpc.passkey.setSettings.useMutation({
    onSuccess: () => {
      setConfirmOn(false);
      refresh();
      toast.success("Saved.");
    },
    onError: e => toast.error(e.message),
  });
  const setExempt = trpc.passkey.setExempt.useMutation({
    onSuccess: refresh,
    onError: e => toast.error(e.message),
  });
  const issue = trpc.passkey.issueCode.useMutation({
    onSuccess: (r, v) => {
      setShown(s => ({ ...s, [v.userId]: r }));
      setVerified(false);
      refresh();
    },
    onError: e => toast.error(e.message),
  });
  const cancel = trpc.passkey.cancelCode.useMutation({
    onSuccess: (_r, v) => {
      setShown(s => {
        const n = { ...s };
        delete n[v.userId];
        return n;
      });
      refresh();
    },
    onError: e => toast.error(e.message),
  });
  const removeDev = trpc.passkey.removeUserDevice.useMutation({
    onSuccess: () => {
      setConfirmRemove(null);
      utils.passkey.userDevices.invalidate();
      refresh();
      toast.success("Device removed. It can no longer sign in.");
    },
    onError: e => toast.error(e.message),
  });

  if (!isAdmin) return null;
  if (!data)
    return (
      <section className={SECTION_CARD}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </section>
    );

  const { settings, isOwner, people } = data;
  // While the requirement is off (the default) only the owner sees anything:
  // nothing changes for other admins until it is switched on.
  if (!isOwner && !settings.requireAll) return null;
  const count = (t: string) => people.filter(p => p.status.tone === t).length;

  return (
    <section className={SECTION_CARD}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className={`${
          open
            ? SECTION_BAND
            : SECTION_BAND.replace("mb-3", "-mb-4").replace("border-b ", "")
        } w-full cursor-pointer text-left hover:bg-muted`}
      >
        <ChevronRight
          className={`h-3.5 w-3.5 text-foreground/70 transition-transform ${open ? "rotate-90" : ""}`}
        />
        <Fingerprint className="h-4 w-4 text-muted-foreground" />
        <h2 className={`${SECTION_TITLE} whitespace-nowrap`}>Passkey login</h2>
        <span className={`${SECTION_COUNT} whitespace-nowrap`}>
          {people.length} people
        </span>
        <span
          className={`ml-auto rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
            settings.requireAll
              ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300"
              : "border-border bg-muted text-muted-foreground"
          }`}
        >
          {settings.requireAll ? "Required for all users" : "Off"}
        </span>
      </button>

      {open && (
        <>
          {isOwner ? (
            <div className="mb-4 space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">
                    Require a passkey for all users
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Off by default. When on, each person gets a few password
                    sign-ins to set up a passkey, then is locked until an admin
                    in their region gives them a one-time code.
                  </div>
                </div>
                <Switch
                  checked={settings.requireAll}
                  disabled={setSettings.isPending}
                  aria-label="Require a passkey for all users"
                  onCheckedChange={on => {
                    if (on) setConfirmOn(true);
                    else
                      setSettings.mutate({
                        requireAll: false,
                        maxPasswordSignIns: settings.maxPasswordSignIns,
                      });
                  }}
                />
              </div>

              {confirmOn && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                  <p className="mb-2 font-semibold">
                    Switch it on for everyone?
                  </p>
                  <p className="mb-3">
                    Everyone's countdown starts from zero. Each person gets{" "}
                    {settings.maxPasswordSignIns} password sign-ins to set up a
                    passkey, and is locked on the next one. People already
                    signed in are not signed out.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setConfirmOn(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      className={FORM_CONFIRM_BUTTON}
                      disabled={setSettings.isPending}
                      onClick={() =>
                        setSettings.mutate({
                          requireAll: true,
                          maxPasswordSignIns: settings.maxPasswordSignIns,
                        })
                      }
                    >
                      Switch on
                    </Button>
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <div className={FORM_LABEL}>
                    Password sign-ins before lockout
                  </div>
                  <Select
                    value={String(settings.maxPasswordSignIns)}
                    onValueChange={v =>
                      setSettings.mutate({
                        requireAll: settings.requireAll,
                        maxPasswordSignIns: Number(v),
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PASSWORD_SIGNINS_CHOICES.map(n => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <div className={FORM_LABEL}>Your own account</div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setSetup(true)}
                  >
                    Register this device for me
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["Set up", count("set")],
                  ["Counting down", count("counting")],
                  ["Locked out", count("locked")],
                  ["Exempt", count("exempt")],
                ].map(([label, n]) => (
                  <div
                    key={label as string}
                    className="rounded-lg border border-border bg-background p-2 text-center"
                  >
                    <div className="text-lg font-bold tabular-nums">{n}</div>
                    <div className="text-xs text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="mb-3 text-sm text-muted-foreground">
              You can issue one-time codes and remove devices for people in your
              own Command, including other admins there. You can't approve your
              own device. Another admin in your Command, or the owner, does
              that.
            </p>
          )}

          <ul className="space-y-2">
            {people.map(p => (
              <li key={p.id} className={`${ROW_ITEM} px-3 py-2.5`}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">
                      {p.name}{" "}
                      <span className="font-normal text-muted-foreground">
                        · CIN {p.cin}
                      </span>
                      {p.id === user?.id && (
                        <span className="ml-2 rounded-full border border-border bg-muted px-2 py-0.5 text-xs">
                          You
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.role === "admin" ? "Admin" : "User"} ·{" "}
                      {COMMAND_LABELS[p.command as CommandCode] ?? p.command}
                    </div>
                  </div>
                  <PasskeyStatusPill status={p.status} />
                </div>

                {p.canAdminister && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setIssuing(issuing === p.id ? null : p.id);
                        setDevicesFor(null);
                        setVerified(false);
                      }}
                    >
                      Issue code
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDevicesFor(devicesFor === p.id ? null : p.id);
                        setIssuing(null);
                        setConfirmRemove(null);
                      }}
                    >
                      Devices ({p.deviceCount})
                    </Button>
                    {isOwner && (
                      <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                        Exempt
                        <Switch
                          checked={p.exempt}
                          aria-label={`Exempt CIN ${p.cin}`}
                          onCheckedChange={v =>
                            setExempt.mutate({ userId: p.id, exempt: v })
                          }
                        />
                      </label>
                    )}
                  </div>
                )}
                {p.id === user?.id && !p.canAdminister && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    You can't approve your own device. Another admin in your
                    region, or the owner, does it.
                  </p>
                )}

                {issuing === p.id && p.canAdminister && (
                  <div className="mt-3 border-t border-dashed border-border pt-3">
                    {shown[p.id] || p.codeExpiresAt ? (
                      <div>
                        {shown[p.id] ? (
                          <>
                            <div className={FIELD_LABEL}>One-time code</div>
                            <div className="my-1 flex items-center gap-2">
                              <span className="font-mono text-2xl font-bold tracking-[0.12em]">
                                {shown[p.id].code}
                              </span>
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label="Copy code"
                                onClick={() => {
                                  navigator.clipboard
                                    ?.writeText(shown[p.id].code)
                                    .catch(() => {});
                                  toast.success("Copied");
                                }}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          </>
                        ) : (
                          <p className="text-sm">
                            A code is already out for this person. Issuing again
                            replaces it.
                          </p>
                        )}
                        <p className="mb-2 text-xs text-muted-foreground">
                          Give it to them by phone or in person. It works once
                          and runs out at{" "}
                          {formatPerth(
                            shown[p.id]?.expiresAt ?? p.codeExpiresAt ?? 0
                          )}
                          .
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => cancel.mutate({ userId: p.id })}
                        >
                          Cancel code
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2.5 text-sm">
                          <Checkbox
                            checked={verified}
                            onCheckedChange={v => setVerified(v === true)}
                          />
                          I have verified this is CIN {p.cin}
                        </label>
                        <Button
                          className={`${FORM_CONFIRM_BUTTON} w-full`}
                          disabled={!verified || issue.isPending}
                          onClick={() => issue.mutate({ userId: p.id })}
                        >
                          Issue one-time code ({ADMIN_CODE_MINUTES} min)
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {devicesFor === p.id && p.canAdminister && (
                  <DeviceList
                    userId={p.id}
                    confirmRemove={confirmRemove}
                    setConfirmRemove={setConfirmRemove}
                    onRemove={id => removeDev.mutate({ userId: p.id, id })}
                    busy={removeDev.isPending}
                  />
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <PasskeySetupDialog
        open={setup}
        onOpenChange={setSetup}
        username={user?.username ?? ""}
        onDone={refresh}
      />
    </section>
  );
}

function DeviceList({
  userId,
  confirmRemove,
  setConfirmRemove,
  onRemove,
  busy,
}: {
  userId: number;
  confirmRemove: number | null;
  setConfirmRemove: (id: number | null) => void;
  onRemove: (id: number) => void;
  busy: boolean;
}) {
  const { data } = trpc.passkey.userDevices.useQuery({ userId });
  return (
    <div className="mt-3 border-t border-dashed border-border pt-3">
      <div className={FIELD_LABEL}>Registered devices</div>
      {!data ? (
        <Loader2 className="mt-2 h-4 w-4 animate-spin" />
      ) : data.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">None.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {data.map(d => (
            <li
              key={d.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{d.name}</div>
                <div className="text-xs text-muted-foreground">
                  Added {formatPerth(d.createdAt)}
                </div>
              </div>
              {confirmRemove === d.id ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirmRemove(null)}
                  >
                    Keep
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => onRemove(d.id)}
                  >
                    Confirm remove
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600"
                  onClick={() => setConfirmRemove(d.id)}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Removing a person's last device locks their next password sign-in until
        you issue a new code.
      </p>
    </div>
  );
}
