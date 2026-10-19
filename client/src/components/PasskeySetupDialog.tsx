/**
 * "Set up a passkey on this device": names the device, asks the browser for the
 * fingerprint / face / PIN step, and registers it. Used by the warning banner,
 * the Profile card and the owner's card in Access Management.
 */
import { useEffect, useState } from "react";
import { Loader2, Fingerprint } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FORM_CONFIRM_BUTTON, FORM_LABEL } from "@/lib/formKit";
import {
  browserSupportsWebAuthn,
  guessDeviceKind,
  passkeyErrorMessage,
  rememberPasskeyUser,
  startRegistration,
  type DeviceKind,
} from "@/lib/passkeyClient";

export function PasskeySetupDialog({
  open,
  onOpenChange,
  username,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username: string;
  onDone?: () => void;
}) {
  const utils = trpc.useUtils();
  const [kind, setKind] = useState<DeviceKind>("Laptop");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const beginMut = trpc.passkey.registerOptions.useMutation();
  const finishMut = trpc.passkey.register.useMutation();

  useEffect(() => {
    if (open) {
      const k = guessDeviceKind();
      setKind(k);
      setName(k === "Laptop" ? "My laptop" : `My ${k.toLowerCase()}`);
    }
  }, [open]);

  const supported = browserSupportsWebAuthn();

  const run = async () => {
    setBusy(true);
    try {
      const { challengeId, options } = await beginMut.mutateAsync();
      const response = await startRegistration({ optionsJSON: options });
      await finishMut.mutateAsync({
        challengeId,
        response,
        deviceName: name.trim() || kind,
        deviceKind: kind,
      });
      rememberPasskeyUser(username);
      await utils.passkey.status.invalidate();
      toast.success("Passkey set up on this device.");
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      toast.error(passkeyErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Fingerprint className="w-4 h-4" />
            Set up a passkey on this device
          </DialogTitle>
          <DialogDescription>
            You will be asked for your fingerprint, face or PIN. RunLog keeps
            only a public key for this device. Nothing about your fingerprint or
            face is sent.
          </DialogDescription>
        </DialogHeader>
        {!supported && (
          <p className="text-sm text-red-600">
            This browser can't make passkeys. Try your phone or another browser.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className={FORM_LABEL}>This device is a</Label>
            <Select value={kind} onValueChange={v => setKind(v as DeviceKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Phone">Phone</SelectItem>
                <SelectItem value="Tablet">Tablet</SelectItem>
                <SelectItem value="Laptop">Laptop</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className={FORM_LABEL}>Name this device</Label>
            <Input
              value={name}
              maxLength={64}
              onChange={e => setName(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className={FORM_CONFIRM_BUTTON}
            onClick={run}
            disabled={busy || !supported}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Set up passkey
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
