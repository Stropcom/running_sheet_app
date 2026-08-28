/**
 * "Import from Document" — upload a .docx target-profile document, parse it
 * deterministically server-side (server/documentImport/, no AI/LLM call —
 * see CLAUDE.md's Golden Rule), and review the proposed fields before
 * handing off to AddTargetDialog to actually save. This dialog never
 * writes anything itself; `onContinue` receives the converted pre-fill and
 * the caller opens AddTargetDialog with it, so the exact same
 * possible-duplicate/merge flow every other new target goes through still
 * applies here.
 */

import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  FileText,
  Upload,
  Loader2,
  AlertTriangle,
  User,
  Building2,
  Mail,
  Phone,
} from "lucide-react";
import {
  EMPTY_ADDRESS_PARTS,
  EMPTY_VEHICLE_PARTS,
  makeExtraId,
  type ExtraAddress,
  type ExtraVehicle,
} from "@/components/TargetStructuredFields";
import type { StagedAssociate } from "@/components/AddTargetDialog";
import type {
  StructuredNameParts,
  StructuredVehicleParts,
} from "@/lib/addressFormat";

export interface DocumentImportPrefill {
  identity: StructuredNameParts;
  address: typeof EMPTY_ADDRESS_PARTS;
  vehicle: StructuredVehicleParts & { vehicleType: string };
  extraAddresses: ExtraAddress[];
  extraVehicles: ExtraVehicle[];
  associates: StagedAssociate[];
}

const CANDIDATE_ICONS = {
  person: User,
  business: Building2,
  email: Mail,
  phone: Phone,
} as const;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

export function ImportTargetDocumentDialog({
  open,
  onClose,
  onContinue,
}: {
  open: boolean;
  onClose: () => void;
  /** Fires once the officer confirms the review screen — the caller opens
   * AddTargetDialog pre-filled with this. */
  onContinue: (prefill: DocumentImportPrefill) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const parseMut = trpc.target.registry.parseDocx.useMutation();

  const reset = () => {
    setFileName("");
    setError("");
    parseMut.reset();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFilePicked = async (file: File) => {
    setError("");
    setFileName(file.name);
    if (!/\.docx$/i.test(file.name)) {
      setError(
        "Only Word (.docx) documents are supported right now — PDF support is planned."
      );
      return;
    }
    try {
      const dataBase64 = await readFileAsBase64(file);
      await parseMut.mutateAsync({ dataBase64 });
    } catch (err: any) {
      setError(
        err?.message ??
          "Couldn't read that document — it may be corrupt or in an unsupported format."
      );
    }
  };

  const result = parseMut.data;

  const handleContinue = () => {
    if (!result) return;
    // Associates found with their own address and/or vehicle attached
    // (e.g. an "Associates:" block) come first, fully pre-filled; a bare
    // person mention with nothing to attach still becomes a staged
    // associate, just with blank address/vehicle fields to fill in.
    const blockAssociates: StagedAssociate[] = result.associateBlocks.map(
      a => ({
        key: makeExtraId(),
        identity: {
          firstNames: a.firstNames,
          surname: a.surname,
          bornDate: "",
        },
        address: a.address
          ? {
              unitNo: a.address.unitNo,
              houseNo: a.address.houseNo,
              streetName: a.address.streetName,
              streetType: a.address.streetType,
              suburb: a.address.suburb,
              state: a.address.state,
              businessName: "",
            }
          : EMPTY_ADDRESS_PARTS,
        vehicle: a.vehicle
          ? {
              registration: a.vehicle.registration,
              state: a.vehicle.state,
              colour: a.vehicle.colour,
              make: a.vehicle.make,
              model: a.vehicle.model,
              vehicleType: a.vehicle.vehicleType,
            }
          : EMPTY_VEHICLE_PARTS,
      })
    );
    const bareAssociates: StagedAssociate[] = result.candidateEntities
      .filter(c => c.type === "person")
      .map(c => {
        const words = c.value.trim().split(/\s+/);
        const last = words[words.length - 1] ?? "";
        const firstNames = words.slice(0, -1).join(" ");
        return {
          key: makeExtraId(),
          identity: {
            firstNames: firstNames || c.value,
            surname: firstNames ? last : "",
            bornDate: "",
          },
          address: EMPTY_ADDRESS_PARTS,
          vehicle: EMPTY_VEHICLE_PARTS,
        };
      });
    const associates: StagedAssociate[] = [
      ...blockAssociates,
      ...bareAssociates,
    ];

    const [primaryAddress, ...restAddresses] = result.addresses;
    const [primaryVehicle, ...restVehicles] = result.vehicles;

    onContinue({
      identity: result.name
        ? {
            firstNames: result.name.firstNames,
            surname: result.name.surname,
            bornDate: result.name.bornDate,
          }
        : { firstNames: "", surname: "", bornDate: "" },
      address: primaryAddress
        ? {
            unitNo: primaryAddress.unitNo,
            houseNo: primaryAddress.houseNo,
            streetName: primaryAddress.streetName,
            streetType: primaryAddress.streetType,
            suburb: primaryAddress.suburb,
            state: primaryAddress.state,
            businessName: "",
          }
        : EMPTY_ADDRESS_PARTS,
      vehicle: primaryVehicle
        ? {
            registration: primaryVehicle.registration,
            state: primaryVehicle.state,
            colour: primaryVehicle.colour,
            make: primaryVehicle.make,
            model: primaryVehicle.model,
            vehicleType: primaryVehicle.vehicleType,
          }
        : EMPTY_VEHICLE_PARTS,
      extraAddresses: restAddresses.map(a => ({
        id: makeExtraId(),
        label: a.label,
        businessName: "",
        unitNo: a.unitNo,
        houseNo: a.houseNo,
        streetName: a.streetName,
        streetType: a.streetType,
        suburb: a.suburb,
        state: a.state,
        full: "",
        short: "",
      })),
      extraVehicles: restVehicles.map(v => ({
        id: makeExtraId(),
        registration: v.registration,
        state: v.state,
        colour: v.colour,
        make: v.make,
        model: v.model,
        vehicleType: v.vehicleType,
        full: "",
        short: "",
      })),
      associates,
    });
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && handleClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            Import from Document
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {!result && (
            <>
              <p className="text-sm text-muted-foreground">
                Upload a Word (.docx) document with target/associate details —
                fields it recognises will pre-fill the Add Target form for you
                to review and confirm. Nothing is saved automatically.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleFilePicked(file);
                }}
              />
              <Button
                variant="outline"
                className="gap-2 self-start"
                disabled={parseMut.isPending}
                onClick={() => fileInputRef.current?.click()}
              >
                {parseMut.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {parseMut.isPending ? "Reading document…" : "Choose .docx file"}
              </Button>
              {fileName && !parseMut.isPending && (
                <p className="text-xs text-muted-foreground">{fileName}</p>
              )}
              {error && (
                <p className="text-xs text-destructive flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {error}
                </p>
              )}
            </>
          )}

          {result && (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-muted-foreground">
                From <span className="font-medium">{fileName}</span> — review
                below, then continue to the Add Target form to edit anything and
                save.
              </p>

              <div className="rounded-lg border border-border/60 bg-muted/10 p-3 flex flex-col gap-1">
                <p className="text-xs font-bold text-primary uppercase tracking-wide">
                  Name
                </p>
                {result.name ? (
                  <p className="text-sm">
                    {result.name.firstNames} {result.name.surname}
                    {result.name.bornDate && (
                      <span className="text-muted-foreground">
                        {" "}
                        — Born {result.name.bornDate}
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    No name field found — fill this in manually.
                  </p>
                )}
              </div>

              {result.addresses.length > 0 && (
                <div className="rounded-lg border border-border/60 bg-muted/10 p-3 flex flex-col gap-1">
                  <p className="text-xs font-bold text-primary uppercase tracking-wide">
                    Addresses ({result.addresses.length})
                  </p>
                  {result.addresses.map((a, i) => (
                    <p key={i} className="text-sm">
                      {a.label && (
                        <span className="text-muted-foreground">
                          {a.label}:{" "}
                        </span>
                      )}
                      {[
                        a.unitNo && `${a.unitNo}/`,
                        a.houseNo,
                        a.streetName,
                        a.streetType,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      , {a.suburb} {a.state}
                      {!a.confident && (
                        <Badge variant="outline" className="ml-1.5 text-[10px]">
                          check street type
                        </Badge>
                      )}
                    </p>
                  ))}
                </div>
              )}

              {result.vehicles.length > 0 && (
                <div className="rounded-lg border border-border/60 bg-muted/10 p-3 flex flex-col gap-1">
                  <p className="text-xs font-bold text-primary uppercase tracking-wide">
                    Vehicles ({result.vehicles.length})
                  </p>
                  {result.vehicles.map((v, i) => (
                    <p key={i} className="text-sm">
                      {v.registration} ({v.state}) — {v.colour} {v.make}{" "}
                      {v.model}
                      {v.vehicleType && ` ${v.vehicleType}`}
                    </p>
                  ))}
                </div>
              )}

              {result.unmappedFields.length > 0 && (
                <div className="rounded-lg border border-border/60 bg-muted/10 p-3 flex flex-col gap-1">
                  <p className="text-xs font-bold text-primary uppercase tracking-wide">
                    Other fields in this document
                  </p>
                  <p className="text-[11px] text-muted-foreground mb-1">
                    Not part of the Target Registry schema — shown for your
                    awareness, not saved.
                  </p>
                  {result.unmappedFields.map((f, i) => (
                    <p key={i} className="text-sm">
                      <span className="text-muted-foreground">{f.label}:</span>{" "}
                      {f.value}
                    </p>
                  ))}
                </div>
              )}

              {result.associateBlocks.length > 0 && (
                <div className="rounded-lg border border-border/60 bg-muted/10 p-3 flex flex-col gap-2">
                  <p className="text-xs font-bold text-primary uppercase tracking-wide">
                    Associates found ({result.associateBlocks.length})
                  </p>
                  {result.associateBlocks.map((a, i) => (
                    <div key={i} className="text-sm flex flex-col gap-0.5">
                      <span className="font-medium">
                        {a.firstNames} {a.surname}
                      </span>
                      {a.address && (
                        <span className="text-muted-foreground text-xs">
                          {[
                            a.address.unitNo && `${a.address.unitNo}/`,
                            a.address.houseNo,
                            a.address.streetName,
                            a.address.streetType,
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          , {a.address.suburb} {a.address.state}
                        </span>
                      )}
                      {a.vehicle && (
                        <span className="text-muted-foreground text-xs">
                          {a.vehicle.registration} ({a.vehicle.state}) —{" "}
                          {a.vehicle.colour} {a.vehicle.make} {a.vehicle.model}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {result.candidateEntities.length > 0 && (
                <div className="rounded-lg border border-border/60 bg-muted/10 p-3 flex flex-col gap-2">
                  <p className="text-xs font-bold text-primary uppercase tracking-wide">
                    Other mentions found in this document
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Detected in the free-text narrative — person mentions will
                    be added below as Associates you can review; the rest are
                    for your awareness only.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.candidateEntities.map((c, i) => {
                      const Icon = CANDIDATE_ICONS[c.type];
                      return (
                        <Badge
                          key={i}
                          variant={
                            c.confidence === "high" ? "default" : "outline"
                          }
                          className="gap-1 font-normal"
                        >
                          <Icon className="w-3 h-3" />
                          {c.value}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          {result && (
            <Button onClick={handleContinue} className="gap-1.5">
              Continue to Add Target
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
